"""
Backend de EnergIA (FastAPI).

Recibe la telemetria de los nodos por MQTT, la valida, la guarda en InfluxDB y la
difunde al dashboard por WebSocket. Expone la API REST, la autenticacion por roles
(auth.py) y ejecuta cada 5 minutos los modelos de Machine Learning (modelos.py).

Flujo de datos:
    ESP32 --MQTT--> Mosquitto --> hilo paho --> cola asyncio --> InfluxDB y WebSocket
    ESP32 --HTTP--> /api/nodes/{id}/config    configuracion al arrancar
    ESP32 --HTTP--> /api/nodes/{id}/backfill  lecturas guardadas durante una desconexion
    Dashboard --HTTP--> API REST
    Dashboard --WS----> /ws/nodes

Los nodos solo envian telemetria con carga; el topico energia/<nodo>/carga indica
"activa" o "reposo".

Ejecucion (un solo proceso: el estado en memoria no se comparte entre procesos):
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import logging
import math
import os
import re
import time
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Set, Tuple

import paho.mqtt.client as mqtt
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS, WriteOptions
from pydantic import BaseModel, Field

import auth
import base_datos
from auth import requiere_tecnico, usuario_actual
from modelos import ServicioIA

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("energia")

# Configuracion (variables de entorno con valores por defecto)
INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8086")
INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "")   # definido en el .env
INFLUX_ORG = os.getenv("INFLUX_ORG", "EnergIA")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "datos_consumo_energetico")

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_PREFIJO = "energia"

MEDICION = "consumo_electrico"
IA_HABILITADA = False                   # detector del prototipo inicial
RUTA_MODELO_IA = "modelo_energia.pkl"

TAM_COLA = 10_000                       # amortigua picos de mensajes
MAX_ANTIGUEDAD_TIEMPO_REAL_MS = 60_000  # mas antigua: reloj del nodo desfasado
MAX_ANTIGUEDAD_BACKFILL_MS = 30 * 24 * 3600 * 1000
TOLERANCIA_FUTURO_MS = 5_000
VENTANA_CORTE_S = 60                    # nodos que caen juntos en esta ventana = posible corte
VENTANA_RESTABLECIMIENTO_S = 120

ZONA_LOCAL = timezone(timedelta(hours=-5))  # Colombia (sin horario de verano)
HUECO_ENERGIA_MS = 10_000     # separacion mayor: el aparato estuvo apagado
MUESTRA_ENERGIA_MS = 2_000    # duracion asignada a la primera lectura tras un encendido
CACHE_ENERGIA_S = 30

PATRON_NODO = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
PATRON_RANGO = re.compile(r"^-\d{1,4}(m|h|d|w)$")
PATRON_VENTANA = re.compile(r"^\d{1,4}(s|m|h|d)$")

ARCHIVO_CONFIG_NODOS = Path(__file__).with_name("config_nodos.json")
ARCHIVO_META_NODOS = Path(__file__).with_name("nodos_meta.json")


def iso_desde_ms(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()


def flux_tiempo(momento: datetime) -> str:
    """Fecha como literal de tiempo de Flux, en UTC (ej. 2026-09-30T05:00:00Z)."""
    return momento.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def validar_nodo(node_id: str) -> None:
    if not PATRON_NODO.match(node_id):
        raise HTTPException(status_code=400, detail="Identificador de nodo invalido")


# Modelos
class NodeReading(BaseModel):
    """Formato del POST HTTP antiguo; se conserva por compatibilidad."""
    nodo: str = Field(..., examples=["nodo_1"], pattern=PATRON_NODO.pattern)
    voltaje: float = Field(..., gt=0)
    corriente: float = Field(..., ge=0)
    potencia: float = Field(..., ge=0)


class NodeData(NodeReading):
    """Lectura en el formato que usa el frontend."""
    timestamp: str
    anomalia: bool = False


class TelemetriaMQTT(BaseModel):
    ts: Optional[int] = None      # epoch UTC en ms (hora del nodo)
    n: Optional[int] = None       # numero de secuencia (medicion de perdidas)
    v: float = Field(..., gt=0, le=400)
    i: float = Field(..., ge=0, le=150)
    p: float = Field(..., ge=0, le=40_000)


class LoteBackfill(BaseModel):
    nodo: Optional[str] = None
    lecturas: List[Tuple[int, float, float, float]] = Field(..., max_length=1000)


class ConfigNodo(BaseModel):
    muestreo_ms: int = Field(2000, ge=1000, le=60_000)
    publicar_activo_ms: int = Field(2000, ge=1000, le=300_000)
    umbral_corriente_a: float = Field(0.02, ge=0, le=5)
    umbral_voltaje_pct: float = Field(5.0, ge=0.5, le=50)
    muestras_para_reposo: int = Field(3, ge=1, le=30)


class MetaNodo(BaseModel):
    """Datos del nodo para la interfaz."""
    nombre: str = Field("", max_length=40)      # electrodomestico medido; el ESP32 lo ignora
    ubicacion: str = Field("", max_length=40)
    umbral_voltaje_pct: float = Field(5.0, ge=0.5, le=50)


# Estado en memoria
latest_readings: Dict[str, NodeData] = {}
ultimo_dato_ms: Dict[str, int] = {}
ultimo_contacto_ms: Dict[str, int] = {}   # cualquier mensaje del nodo (no solo lecturas)
cargas_nodos: Dict[str, dict] = {}         # "activa" / "reposo" por nodo
estados_nodos: Dict[str, dict] = {}
config_nodos: Dict[str, dict] = {}
meta_nodos: Dict[str, dict] = {}
cache_energia: Dict[str, Tuple[float, dict]] = {}
eventos_recientes: Deque[dict] = deque(maxlen=100)
secuencias: Dict[str, dict] = {}     # por nodo: ultimo n, recibidos, perdidos
estadisticas = {"mqtt_recibidos": 0, "descartados_cola": 0, "errores_procesamiento": 0,
                "errores_influx": 0, "backfill_guardadas": 0, "fuera_de_rango": 0}

# Rango de medicion del PZEM-004T v3. Una lectura fuera de el es un error del sensor y no se guarda.
RANGO_SENSOR = {"v": (80.0, 260.0), "i": (0.0, 100.0), "p": (0.0, 23_000.0)}


def lectura_valida(v: float, i: float, p: float) -> bool:
    return all(math.isfinite(x) for x in (v, i, p)) and \
        RANGO_SENSOR["v"][0] <= v <= RANGO_SENSOR["v"][1] and \
        RANGO_SENSOR["i"][0] <= i <= RANGO_SENSOR["i"][1] and \
        RANGO_SENSOR["p"][0] <= p <= RANGO_SENSOR["p"][1]
cola: Optional[asyncio.Queue] = None
modelo_ia = None


# InfluxDB
class Almacen:
    """Dos canales de escritura:
    - por lotes (no bloquea): telemetria en vivo, agrupada cada 1 s o 500 puntos
    - sincrono (con confirmacion): backfill, para responder 200 solo si quedo guardado
    """

    def __init__(self) -> None:
        self.client: Optional[InfluxDBClient] = None
        self.write_lote = None
        self.write_sync = None
        self.query_api = None

    def iniciar(self) -> None:
        self.client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG, timeout=30_000)
        try:
            ok = self.client.ping()
        except Exception:
            ok = False
        if ok:
            log.info("InfluxDB disponible en %s", INFLUX_URL)
        else:
            log.warning("InfluxDB no responde en %s; las escrituras se reintentaran", INFLUX_URL)

        self.write_lote = self.client.write_api(
            write_options=WriteOptions(batch_size=500, flush_interval=1_000, jitter_interval=0,
                                       retry_interval=5_000, max_retries=5,
                                       max_retry_delay=30_000, exponential_base=2),
            error_callback=self._error,
            retry_callback=self._reintento,
        )
        self.write_sync = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()

    @staticmethod
    def _error(conf, data, exc) -> None:
        estadisticas["errores_influx"] += 1
        log.error("InfluxDB descarto un lote tras los reintentos: %s", exc)

    @staticmethod
    def _reintento(conf, data, exc) -> None:
        log.warning("InfluxDB reintentando escritura: %s", exc)

    def escribir(self, puntos) -> None:
        try:
            self.write_lote.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=puntos)
        except Exception as e:
            estadisticas["errores_influx"] += 1
            log.error("Error encolando escritura en InfluxDB: %s", e)

    def escribir_confirmado(self, puntos) -> None:
        self.write_sync.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=puntos)

    def consultar(self, flux: str):
        # Las consultas parametrizadas solo funcionan en InfluxDB Cloud; los valores
        # que se insertan en una consulta se validan antes.
        return self.query_api.query(flux, org=INFLUX_ORG)

    def cerrar(self) -> None:
        with suppress(Exception):
            self.write_lote.close()     # vacia el lote pendiente
        with suppress(Exception):
            self.client.close()


almacen = Almacen()

# Modelos de Machine Learning (prediccion y anomalias)
ia = ServicioIA(consultar=almacen.consultar, escribir=almacen.escribir,
                bucket=INFLUX_BUCKET, medicion=MEDICION, zona=ZONA_LOCAL)
INTERVALO_IA_S = 300


def restaurar_ultimas_lecturas() -> None:
    """Tras un reinicio, recupera la ultima lectura de cada nodo desde InfluxDB."""
    flux = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "{MEDICION}")
  |> filter(fn: (r) => r._field == "voltaje" or r._field == "corriente" or r._field == "potencia")
  |> last()
'''
    datos: Dict[str, dict] = {}
    for tabla in almacen.consultar(flux):
        for r in tabla.records:
            nodo = r.values.get("nodo")
            if not nodo:
                continue
            d = datos.setdefault(nodo, {})
            d[r.get_field()] = r.get_value()
            ts = int(r.get_time().timestamp() * 1000)
            d["_ts"] = max(d.get("_ts", 0), ts)
    for nodo, d in datos.items():
        if all(k in d for k in ("voltaje", "corriente", "potencia")) and d["voltaje"] > 0:
            latest_readings[nodo] = NodeData(nodo=nodo, voltaje=d["voltaje"], corriente=d["corriente"],
                                             potencia=d["potencia"], timestamp=iso_desde_ms(d["_ts"]))
            ultimo_dato_ms[nodo] = d["_ts"]
            ultimo_contacto_ms[nodo] = d["_ts"]
    log.info("Ultimas lecturas restauradas para %d nodo(s)", len(latest_readings))


# WebSocket
class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    @staticmethod
    async def _enviar(ws: WebSocket, texto: str) -> bool:
        try:
            await asyncio.wait_for(ws.send_text(texto), timeout=2)
            return True
        except Exception:
            return False

    async def broadcast(self, message: dict) -> None:
        """Envio concurrente con timeout: un navegador lento no frena a los demas."""
        if not self.active_connections:
            return
        texto = json.dumps(message)
        conexiones = list(self.active_connections)
        resultados = await asyncio.gather(*(self._enviar(ws, texto) for ws in conexiones))
        for ws, ok in zip(conexiones, resultados):
            if not ok:
                self.disconnect(ws)


manager = ConnectionManager()


# Deteccion de cortes de energia
class DetectorCortes:
    """Distingue un corte general de la falla de un solo nodo.
    - Corte: todos los nodos activos se desconectan casi al mismo tiempo
      (requiere que la Raspberry y el router sigan encendidos, p. ej. con UPS).
    - Restablecimiento: la mayoria de los nodos reinicia con motivo "encendido"
      (funciona aunque la Raspberry tambien se haya apagado).
    """

    def __init__(self) -> None:
        self.offline_desde: Dict[str, float] = {}
        self.encendidos: Dict[str, float] = {}
        self.dato_previo: Dict[str, int] = {}
        self.corte_abierto: Optional[dict] = None
        self.ultimo_restablecimiento = 0.0

    def registrar(self, nodo: str, estado: str, reset: Optional[str], t: float) -> Optional[dict]:
        if estado == "offline":
            self.offline_desde[nodo] = t
            return self._revisar_corte(t)
        if estado == "online":
            self.offline_desde.pop(nodo, None)
            if reset in ("encendido", "caida_tension"):
                self.encendidos[nodo] = t
                self.dato_previo.setdefault(nodo, ultimo_contacto_ms.get(nodo, 0))
                return self._revisar_restablecimiento(t)
        return None

    def _revisar_corte(self, t: float) -> Optional[dict]:
        if self.corte_abierto:
            return None
        # Se usa el estado de conexion y no las lecturas: un nodo en reposo
        # no envia datos, pero sigue conectado al broker.
        if any(e.get("estado") == "online" for e in estados_nodos.values()):
            return None
        caidos = {n for n, t0 in self.offline_desde.items() if t - t0 <= VENTANA_CORTE_S}
        if not caidos:
            return None
        tiempos = [self.offline_desde[n] for n in caidos]
        inicio_ms = max(ultimo_contacto_ms.get(n, 0) for n in caidos) or int(min(tiempos) * 1000)
        self.corte_abierto = {"inicio_ms": inicio_ms}
        return {"tipo": "posible_corte_energia", "inicio": iso_desde_ms(inicio_ms),
                "nodos": sorted(caidos),
                "descripcion": "Todos los nodos activos se desconectaron casi al mismo tiempo"}

    def _revisar_restablecimiento(self, t: float) -> Optional[dict]:
        conocidos: Set[str] = set(estados_nodos) | set(latest_readings)
        recientes = [n for n, te in self.encendidos.items() if t - te <= VENTANA_RESTABLECIMIENTO_S]
        requerido = max(1, math.ceil(0.6 * len(conocidos)))
        if len(recientes) < requerido or t - self.ultimo_restablecimiento < 2 * VENTANA_RESTABLECIMIENTO_S:
            return None
        if self.corte_abierto:
            inicio_ms = self.corte_abierto["inicio_ms"]
        else:
            inicio_ms = max((self.dato_previo.get(n, 0) for n in recientes), default=0)
        fin_ms = int(min(self.encendidos[n] for n in recientes) * 1000)
        evento = {"tipo": "restablecimiento_energia", "fin": iso_desde_ms(fin_ms),
                  "nodos": sorted(recientes),
                  "descripcion": "Los nodos reiniciaron por encendido: probable regreso de la energia"}
        if inicio_ms and inicio_ms < fin_ms:
            evento["inicio"] = iso_desde_ms(inicio_ms)
            evento["duracion_s"] = round((fin_ms - inicio_ms) / 1000)
        self.corte_abierto = None
        self.encendidos.clear()
        self.dato_previo.clear()
        self.ultimo_restablecimiento = t
        return evento


detector = DetectorCortes()


async def registrar_evento(evento: dict) -> None:
    evento.setdefault("registrado", datetime.now(timezone.utc).isoformat())
    eventos_recientes.appendleft(evento)
    punto = (Point("eventos").tag("tipo", evento["tipo"])
             .field("descripcion", evento.get("descripcion", ""))
             .field("nodos", ",".join(evento.get("nodos", []))))
    if "duracion_s" in evento:
        punto = punto.field("duracion_s", float(evento["duracion_s"]))
    almacen.escribir(punto)
    log.warning("EVENTO %s: %s", evento["tipo"], evento.get("descripcion", ""))
    await manager.broadcast({"type": "evento", "data": evento})


# Detector por lectura del prototipo inicial (deshabilitado; la deteccion actual esta en modelos.py)
def cargar_modelo_ia() -> None:
    global modelo_ia
    if not IA_HABILITADA:
        log.info("Modulo de anomalias deshabilitado (recoleccion de datos)")
        return
    try:
        import joblib
        modelo_ia = joblib.load(RUTA_MODELO_IA)
        log.info("Modelo de IA cargado")
    except Exception as e:
        log.error("No se pudo cargar el modelo de IA: %s", e)


def _predecir(v: float, i: float, p: float) -> bool:
    import pandas as pd
    # Modelo del prototipo, entrenado con el dataset UCI (230 V, potencia en kW).
    df = pd.DataFrame([{"Voltage": v, "Global_intensity": i, "Global_active_power": p}])
    return bool(modelo_ia.predict(df)[0] == -1)


async def evaluar_anomalia(v: float, i: float, p: float) -> bool:
    if not IA_HABILITADA or modelo_ia is None:
        return False
    # Inferencia en un hilo para no bloquear el bucle de eventos.
    return await asyncio.to_thread(_predecir, v, i, p)


# Procesamiento de lecturas
def resolver_marca(ts_ms: Optional[int], recibido_s: float) -> Tuple[int, Optional[int]]:
    """Usa la hora del nodo si es confiable; si no, la del servidor. Devuelve (ts, latencia)."""
    ahora = int(recibido_s * 1000)
    if ts_ms is None:
        return ahora, None
    if ts_ms > ahora + TOLERANCIA_FUTURO_MS or ts_ms < ahora - MAX_ANTIGUEDAD_TIEMPO_REAL_MS:
        return ahora, None
    return ts_ms, max(0, ahora - ts_ms)


def contabilizar_secuencia(nodo: str, n: Optional[int]) -> None:
    """Cuenta mensajes MQTT perdidos en transito (criterio: < 0,1 %)."""
    if n is None:
        return
    s = secuencias.setdefault(nodo, {"ultimo": None, "recibidos": 0, "perdidos": 0})
    s["recibidos"] += 1
    if s["ultimo"] is not None and n > s["ultimo"] + 1:
        s["perdidos"] += n - s["ultimo"] - 1
    s["ultimo"] = n   # si n es menor, el nodo se reinicio: se retoma desde ahi


async def registrar_lectura(nodo: str, v: float, i: float, p: float,
                            ts_ms: int, latencia_ms: Optional[int] = None) -> None:
    if not lectura_valida(v, i, p):
        estadisticas["fuera_de_rango"] += 1
        log.warning("Lectura fuera del rango del sensor descartada (%s): %s V, %s A, %s W", nodo, v, i, p)
        return
    anomalia = await evaluar_anomalia(v, i, p)

    puntos = [Point(MEDICION).tag("nodo", nodo)
              .field("voltaje", float(v)).field("corriente", float(i)).field("potencia", float(p))
              .time(ts_ms, WritePrecision.MS)]
    if latencia_ms is not None:
        # measurement aparte para no mezclarlo con las variables electricas
        puntos.append(Point("latencia").tag("nodo", nodo)
                      .field("latencia_ms", int(latencia_ms)).time(ts_ms, WritePrecision.MS))
    almacen.escribir(puntos)

    if ts_ms >= ultimo_dato_ms.get(nodo, 0):
        ultimo_dato_ms[nodo] = ts_ms
        data = NodeData(nodo=nodo, voltaje=v, corriente=i, potencia=p,
                        timestamp=iso_desde_ms(ts_ms), anomalia=anomalia)
        latest_readings[nodo] = data
        await manager.broadcast({"type": "update", "data": data.model_dump()})


async def manejar_telemetria(nodo: str, datos: dict, recibido_s: float) -> None:
    t = TelemetriaMQTT.model_validate(datos)
    contabilizar_secuencia(nodo, t.n)
    ts_ms, latencia = resolver_marca(t.ts, recibido_s)
    await registrar_lectura(nodo, t.v, t.i, t.p, ts_ms, latencia)


async def manejar_estado(nodo: str, datos: dict, recibido_s: float, retenido: bool) -> None:
    estado = str(datos.get("estado", "desconocido"))
    info = {"nodo": nodo, "estado": estado,
            "desde": iso_desde_ms(int(recibido_s * 1000))}
    for k in ("reset", "ip", "rssi", "pendientes", "descartadas", "uptime_s"):
        if k in datos:
            info[k] = datos[k]
    info["retenido"] = retenido   # True = dato guardado en el broker, no un cambio actual
    estados_nodos[nodo] = info
    await manager.broadcast({"type": "estado", "data": info})

    if retenido:
        return   # es historia guardada en el broker, no un cambio actual
    almacen.escribir(Point("estado_nodo").tag("nodo", nodo)
                     .field("estado", estado).field("reset", str(datos.get("reset", ""))))
    evento = detector.registrar(nodo, estado, datos.get("reset"), recibido_s)
    if evento:
        await registrar_evento(evento)


async def manejar_carga(nodo: str, datos: dict, recibido_s: float, retenido: bool) -> None:
    """El aparato paso a "activa" o "reposo". Se registra como evento aparte
    (measurement cambios_carga), nunca como lecturas en cero."""
    carga = str(datos.get("carga", ""))
    if carga not in ("activa", "reposo"):
        return
    ts_ms, _ = resolver_marca(datos.get("ts"), recibido_s)
    info = {"nodo": nodo, "carga": carga, "desde": iso_desde_ms(ts_ms), "retenido": retenido}
    cargas_nodos[nodo] = info
    await manager.broadcast({"type": "carga", "data": info})
    if not retenido:
        # Encendidos y apagados para el conjunto de datos
        almacen.escribir(Point("cambios_carga").tag("nodo", nodo)
                         .field("carga", carga).time(ts_ms, WritePrecision.MS))


async def procesar_cola() -> None:
    """Trabajador unico: procesa los mensajes en orden de llegada."""
    while True:
        topico, payload, recibido_s, retenido = await cola.get()
        try:
            partes = topico.split("/")
            if len(partes) != 3 or partes[0] != MQTT_PREFIJO or not PATRON_NODO.match(partes[1]):
                continue
            nodo, tipo = partes[1], partes[2]
            if not retenido:
                ultimo_contacto_ms[nodo] = int(recibido_s * 1000)
            datos = json.loads(payload)
            if tipo == "telemetria":
                await manejar_telemetria(nodo, datos, recibido_s)
            elif tipo == "estado":
                await manejar_estado(nodo, datos, recibido_s, retenido)
            elif tipo == "carga":
                await manejar_carga(nodo, datos, recibido_s, retenido)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            estadisticas["errores_procesamiento"] += 1
            log.warning("Mensaje descartado en %s: %s", topico, e)
        finally:
            cola.task_done()


# Puente MQTT (paho corre en su propio hilo y entrega a la cola de asyncio)
class PuenteMQTT:
    def __init__(self) -> None:
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.conectado = False
        self.client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                                  client_id="backend-energia", clean_session=True)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)

    def iniciar(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop
        self.client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=30)
        self.client.loop_start()   # hilo propio con reconexion automatica

    def detener(self) -> None:
        with suppress(Exception):
            self.client.disconnect()
        with suppress(Exception):
            self.client.loop_stop()

    def publicar(self, topico: str, mensaje: str, qos: int = 1) -> bool:
        info = self.client.publish(topico, mensaje, qos=qos)
        return info.rc == mqtt.MQTT_ERR_SUCCESS

    # callbacks (se ejecutan en el hilo de paho)
    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            log.error("Broker MQTT rechazo la conexion: %s", reason_code)
            return
        self.conectado = True
        # Se suscribe en cada conexion: sobrevive a reinicios del broker.
        client.subscribe([(f"{MQTT_PREFIJO}/+/telemetria", 0), (f"{MQTT_PREFIJO}/+/estado", 1),
                          (f"{MQTT_PREFIJO}/+/carga", 0)])
        log.info("Conectado a Mosquitto en %s:%s", MQTT_HOST, MQTT_PORT)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        self.conectado = False
        log.warning("Desconectado de Mosquitto (%s); reconectando...", reason_code)

    def _on_message(self, client, userdata, msg) -> None:
        estadisticas["mqtt_recibidos"] += 1
        item = (msg.topic, msg.payload, time.time(), bool(msg.retain))
        with suppress(RuntimeError):   # el bucle ya se cerro durante el apagado
            self.loop.call_soon_threadsafe(_encolar, item)


def _encolar(item) -> None:
    try:
        cola.put_nowait(item)
    except asyncio.QueueFull:
        estadisticas["descartados_cola"] += 1


puente = PuenteMQTT()


# Configuracion de nodos (persistida en JSON)
def cargar_json(ruta: Path, destino: dict) -> None:
    if ruta.exists():
        try:
            destino.update(json.loads(ruta.read_text(encoding="utf-8")))
        except Exception as e:
            log.error("%s ilegible: %s", ruta.name, e)


def guardar_json(ruta: Path, datos: dict) -> None:
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(datos, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(ruta)   # escritura atomica: no se corrompe si se va la luz


# Ciclo de vida de la aplicacion
@asynccontextmanager
async def lifespan(app: FastAPI):
    global cola
    if not INFLUX_TOKEN:
        raise RuntimeError("Falta INFLUX_TOKEN en el archivo .env del backend")
    base_datos.iniciar()
    if base_datos.contar_tecnicos_activos() == 0:
        log.warning("No hay cuentas de tecnico. Crea una con: python crear_usuario.py crear ... --rol tecnico")
    log.info("Inicio de sesion %s", "OBLIGATORIO" if auth.AUTH_OBLIGATORIA
             else "en modo transicion (AUTH_OBLIGATORIA=0: se aceptan peticiones sin token)")
    cola = asyncio.Queue(maxsize=TAM_COLA)
    almacen.iniciar()
    cargar_json(ARCHIVO_CONFIG_NODOS, config_nodos)
    cargar_json(ARCHIVO_META_NODOS, meta_nodos)
    try:
        await asyncio.to_thread(restaurar_ultimas_lecturas)
    except Exception as e:
        log.warning("No se pudieron restaurar las ultimas lecturas: %s", e)
    cargar_modelo_ia()
    await asyncio.to_thread(ia.cargar)

    trabajador = asyncio.create_task(procesar_cola())
    tarea_energia = asyncio.create_task(tarea_energia_horaria())
    tarea_ia = asyncio.create_task(tarea_modelos_ia())
    puente.iniciar(asyncio.get_running_loop())
    await registrar_evento({"tipo": "inicio_backend",
                            "descripcion": "El backend arranco (tras un reinicio o un corte)"})
    yield
    puente.detener()
    trabajador.cancel()
    tarea_energia.cancel()
    tarea_ia.cancel()
    with suppress(asyncio.CancelledError):
        await trabajador
    almacen.cerrar()


app = FastAPI(title="Energy Monitor API", version="0.4.0", lifespan=lifespan)
app.include_router(auth.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # "*" con credenciales es rechazado por los navegadores
    allow_methods=["*"],
    allow_headers=["*"],
)


# Endpoints HTTP
@app.get("/")
def root():
    """Publico: indica si el servidor y el broker estan activos."""
    return {"status": "ok", "message": "Energy Monitor API funcionando", "mqtt_conectado": puente.conectado}


@app.get("/api/sistema/estadisticas")
def estadisticas_sistema(_: dict = Depends(requiere_tecnico)):
    return {
        "mqtt_conectado": puente.conectado,
        "cola_pendiente": cola.qsize() if cola else 0,
        "estadisticas": estadisticas,
        "perdidas_mqtt": {
            n: {**s, "tasa_perdida_pct": round(100 * s["perdidos"] / max(1, s["recibidos"] + s["perdidos"]), 3)}
            for n, s in secuencias.items()
        },
    }


@app.get("/api/nodes/data")
def get_all_nodes(_: dict = Depends(usuario_actual)):
    return {"nodes": [latest_readings[n].model_dump() for n in sorted(latest_readings)]}


@app.get("/api/nodes/estado")
def get_estados(_: dict = Depends(usuario_actual)):
    return {"nodos": [{**estados_nodos[n], "carga": cargas_nodos.get(n, {}).get("carga")}
                      for n in sorted(estados_nodos)]}


@app.get("/api/nodes/{node_id}/data")
def get_node(node_id: str, _: dict = Depends(usuario_actual)):
    if node_id not in latest_readings:
        return {"error": f"aun no hay datos para '{node_id}'"}
    return latest_readings[node_id].model_dump()


@app.post("/api/nodes/data", response_model=dict)
async def receive_node_data(reading: NodeReading):
    """Compatibilidad con nodos que aun envian por HTTP (hora del servidor)."""
    await registrar_lectura(reading.nodo, reading.voltaje, reading.corriente,
                            reading.potencia, int(time.time() * 1000))
    return {"status": "received", "nodo": reading.nodo, "anomalia": False}


@app.get("/api/nodes/config")
def obtener_configs(_: dict = Depends(requiere_tecnico)):
    """Configuracion (incluido el nombre) de todos los nodos conocidos, para el frontend."""
    conocidos = set(config_nodos) | set(estados_nodos) | set(latest_readings) | set(cargas_nodos)
    return {"nodos": {n: ConfigNodo(**config_nodos.get(n, {})).model_dump() for n in sorted(conocidos)}}


@app.get("/api/nodes/{node_id}/config")
def obtener_config(node_id: str):
    """Sin sesion: el ESP32 la consulta al arrancar."""
    validar_nodo(node_id)
    return ConfigNodo(**config_nodos.get(node_id, {})).model_dump()


@app.put("/api/nodes/{node_id}/config")
def actualizar_config(node_id: str, nueva: ConfigNodo, _: dict = Depends(requiere_tecnico)):
    validar_nodo(node_id)
    config_nodos[node_id] = nueva.model_dump()
    guardar_json(ARCHIVO_CONFIG_NODOS, config_nodos)
    notificado = puente.publicar(f"{MQTT_PREFIJO}/{node_id}/cmd", "recargar_config", qos=1)
    return {"status": "ok", "config": config_nodos[node_id], "nodo_notificado": notificado}


@app.post("/api/nodes/{node_id}/backfill")
async def recibir_backfill(node_id: str, lote: LoteBackfill):
    """Recibe lecturas guardadas por el nodo durante una caida de red.
    Solo responde 200 cuando InfluxDB confirmo la escritura; asi el nodo
    puede borrar su copia local con seguridad. Reenviar un lote no duplica
    datos: InfluxDB sobrescribe puntos con el mismo nodo y la misma hora."""
    validar_nodo(node_id)
    ahora = int(time.time() * 1000)
    puntos, descartadas = [], 0
    for ts, v, i, p in lote.lecturas:
        valores_ok = lectura_valida(v, i, p)
        hora_ok = ahora - MAX_ANTIGUEDAD_BACKFILL_MS <= ts <= ahora + TOLERANCIA_FUTURO_MS
        if not (valores_ok and hora_ok):
            descartadas += 1
            continue
        puntos.append(Point(MEDICION).tag("nodo", node_id)
                      .field("voltaje", float(v)).field("corriente", float(i)).field("potencia", float(p))
                      .time(ts, WritePrecision.MS))
    if puntos:
        try:
            await asyncio.to_thread(almacen.escribir_confirmado, puntos)
        except Exception as e:
            log.error("Backfill de %s no guardado: %s", node_id, e)
            raise HTTPException(status_code=503, detail="InfluxDB no disponible; reintente")
    estadisticas["backfill_guardadas"] += len(puntos)
    if puntos:
        await manager.broadcast({"type": "backfill", "data": {"nodo": node_id, "cantidad": len(puntos)}})
    return {"status": "ok", "guardadas": len(puntos), "descartadas": descartadas}


async def consultar_historico(desde: str, ventana: str, nodo: Optional[str]) -> List[dict]:
    if not PATRON_RANGO.match(desde) or not PATRON_VENTANA.match(ventana):
        raise HTTPException(status_code=400, detail="Formato de 'desde' o 'ventana' invalido")
    if nodo and not PATRON_NODO.match(nodo):
        raise HTTPException(status_code=400, detail="Identificador de nodo invalido")
    filtro_nodo = f' and r.nodo == "{nodo}"' if nodo else ""
    flux = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {desde})
  |> filter(fn: (r) => r._measurement == "{MEDICION}"{filtro_nodo})
  |> filter(fn: (r) => r._field == "voltaje" or r._field == "corriente" or r._field == "potencia")
  |> aggregateWindow(every: {ventana}, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
'''
    try:
        tablas = await asyncio.to_thread(almacen.consultar, flux)
    except Exception as e:
        log.error("Consulta de historico fallo: %s", e)
        raise HTTPException(status_code=503, detail="InfluxDB no disponible")
    puntos = []
    for tabla in tablas:
        for r in tabla.records:
            puntos.append({"nodo": r.values.get("nodo"),
                           "timestamp": r.get_time().isoformat(),
                           "voltaje": r.values.get("voltaje"),
                           "corriente": r.values.get("corriente"),
                           "potencia": r.values.get("potencia")})
    puntos.sort(key=lambda x: x["timestamp"])
    return puntos


@app.get("/api/historico")
async def historico_general(desde: str = Query("-1h", description="Rango relativo: -30m, -6h, -7d, -4w"),
                            ventana: str = Query("1m", description="Agregacion: 15s, 1m, 1h, 1d"),
                            nodo: Optional[str] = Query(None, description="Opcional: un solo nodo"),
                            _: dict = Depends(usuario_actual)):
    """Promedios por ventana de todos los nodos (o de uno). Los periodos sin
    carga no tienen puntos: el frontend los muestra como tramos vacios."""
    if nodo:
        validar_nodo(nodo)
    return {"desde": desde, "ventana": ventana, "puntos": await consultar_historico(desde, ventana, nodo)}


@app.get("/api/nodes/{node_id}/historico")
async def historico(node_id: str, desde: str = Query("-1h"), ventana: str = Query("1m"),
                    _: dict = Depends(usuario_actual)):
    validar_nodo(node_id)
    return {"nodo": node_id, "desde": desde, "ventana": ventana,
            "puntos": await consultar_historico(desde, ventana, node_id)}


@app.get("/api/energia/resumen")
async def energia_resumen(inicio: str = Query(..., description="Fecha ISO 8601, p. ej. la medianoche local"),
                          _: dict = Depends(usuario_actual)):
    """Energia (kWh) consumida por cada nodo desde 'inicio', calculada a partir
    de la potencia. Los periodos en reposo no suman (no hay lecturas)."""
    try:
        dt = datetime.fromisoformat(inicio.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha 'inicio' invalida")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        por_nodo, _, _ = await asyncio.to_thread(energia_desde, dt)
    except Exception as e:
        log.error("Consulta de energia fallo: %s", e)
        raise HTTPException(status_code=503, detail="InfluxDB no disponible")
    nodos = {n: round(v, 4) for n, v in sorted(por_nodo.items())}
    return {"inicio": dt.isoformat(), "nodos": nodos, "total_kwh": round(sum(nodos.values()), 4)}


@app.get("/api/nodes/meta")
def obtener_metadatos(_: dict = Depends(usuario_actual)):
    return {"nodos": meta_nodos}


@app.put("/api/nodes/{node_id}/meta")
async def actualizar_metadatos(node_id: str, meta: MetaNodo, _: dict = Depends(usuario_actual)):
    """El residente tambien puede renombrar sus aparatos."""
    validar_nodo(node_id)
    datos = {"nombre": meta.nombre.strip(), "ubicacion": meta.ubicacion.strip()}
    meta_nodos[node_id] = datos
    guardar_json(ARCHIVO_META_NODOS, meta_nodos)
    await manager.broadcast({"type": "meta", "data": {"nodo": node_id, **datos}})
    return {"status": "ok", "nodo": node_id, **datos}


def inicio_periodo(periodo: str) -> datetime:
    medianoche = datetime.now(ZONA_LOCAL).replace(hour=0, minute=0, second=0, microsecond=0)
    return medianoche if periodo == "hoy" else medianoche - timedelta(days=6)


# Energia (kWh). Una tarea de fondo calcula la energia de cada hora y la guarda en
# energia_horaria; las consultas suman esas horas y la hora en curso.
ENERGIA_HORARIA = "energia_horaria"
HORAS_RECALCULO = 3          # se recalculan las ultimas horas por si llegan datos tardios (backfill)
MAX_HORAS_POR_CICLO = 24     # puesta al dia gradual al arrancar
INTERVALO_ENERGIA_S = 300
estado_energia: Dict[str, Any] = {"hasta": None}   # primera hora aun no calculada


def piso_hora(momento: datetime) -> datetime:
    return momento.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def energia_en_rango(inicio: datetime, fin: datetime) -> Dict[str, float]:
    """kWh por nodo entre inicio y fin, integrando la potencia en el tiempo.
    Cada lectura aporta potencia x tiempo desde la lectura anterior; si ese
    tiempo supera HUECO_ENERGIA_MS, el aparato estuvo apagado (el nodo no
    envia ceros) y solo se cuenta una muestra."""
    if fin <= inicio:
        return {}
    flux = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {flux_tiempo(inicio)}, stop: {flux_tiempo(fin)})
  |> filter(fn: (r) => r._measurement == "{MEDICION}" and r._field == "potencia")
  |> elapsed(unit: 1ms)
  |> map(fn: (r) => {{
      dt = if r.elapsed > {HUECO_ENERGIA_MS} then {MUESTRA_ENERGIA_MS} else r.elapsed
      return {{r with _value: r._value * float(v: dt) / 3600000.0}}
  }})
  |> sum()
'''
    resultado: Dict[str, float] = {}
    for tabla in almacen.consultar(flux):
        for r in tabla.records:
            nodo, wh = r.values.get("nodo"), r.get_value()
            if nodo and wh is not None:
                resultado[nodo] = resultado.get(nodo, 0.0) + wh / 1000.0
    return resultado


def extremo_temporal(medicion: str, campo: str, funcion: str) -> Optional[datetime]:
    """Primera (first) o ultima (last) marca de tiempo de un measurement."""
    flux = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: -400d)
  |> filter(fn: (r) => r._measurement == "{medicion}" and r._field == "{campo}")
  |> {funcion}()
'''
    tiempos = [r.get_time() for tabla in almacen.consultar(flux) for r in tabla.records]
    if not tiempos:
        return None
    return max(tiempos) if funcion == "last" else min(tiempos)


def actualizar_energia_horaria() -> Tuple[int, bool]:
    """Calcula y guarda las horas completas pendientes. Devuelve
    (horas calculadas, si quedan pendientes para el siguiente ciclo)."""
    hora_actual = piso_hora(datetime.now(timezone.utc))
    ultima = extremo_temporal(ENERGIA_HORARIA, "kwh", "last")
    if ultima is None:
        primera = extremo_temporal(MEDICION, "potencia", "first")
        if primera is None:
            estado_energia["hasta"] = hora_actual
            return 0, False
        desde = piso_hora(primera)
    else:
        desde = piso_hora(ultima) - timedelta(hours=HORAS_RECALCULO - 1)

    hora, calculadas = desde, 0
    while hora < hora_actual and calculadas < MAX_HORAS_POR_CICLO:
        kwh = energia_en_rango(hora, hora + timedelta(hours=1))
        puntos = [Point(ENERGIA_HORARIA).tag("nodo", n).field("kwh", round(v, 6)).time(hora, WritePrecision.S)
                  for n, v in kwh.items()]
        if puntos:
            almacen.escribir_confirmado(puntos)
        hora += timedelta(hours=1)
        calculadas += 1
    estado_energia["hasta"] = hora
    return calculadas, hora < hora_actual


async def tarea_energia_horaria() -> None:
    await asyncio.sleep(15)   # deja arrancar el resto del backend
    while True:
        pendientes = False
        try:
            calculadas, pendientes = await asyncio.to_thread(actualizar_energia_horaria)
            if calculadas:
                log.info("Energia horaria: %d hora(s) calculadas%s", calculadas,
                         " (continua la puesta al dia)" if pendientes else "")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("Energia horaria: no se pudo actualizar (%s)", e)
        await asyncio.sleep(5 if pendientes else INTERVALO_ENERGIA_S)


def energia_desde(inicio: datetime) -> Tuple[Dict[str, float], Dict[datetime, Dict[str, float]], bool]:
    """kWh por nodo y por hora desde 'inicio' hasta ahora:
    horas completas ya guardadas + tramos parciales calculados en vivo."""
    ahora = datetime.now(timezone.utc)
    hora_actual = piso_hora(ahora)
    primera_completa = piso_hora(inicio)
    if primera_completa < inicio:
        primera_completa += timedelta(hours=1)

    por_nodo: Dict[str, float] = {}
    por_hora: Dict[datetime, Dict[str, float]] = {}

    def sumar(valores: Dict[str, float], hora: datetime) -> None:
        for nodo, kwh in valores.items():
            por_nodo[nodo] = por_nodo.get(nodo, 0.0) + kwh
            fila = por_hora.setdefault(hora, {})
            fila[nodo] = fila.get(nodo, 0.0) + kwh

    if primera_completa >= hora_actual:
        sumar(energia_en_rango(inicio, ahora), piso_hora(inicio))
    else:
        if inicio < primera_completa:
            sumar(energia_en_rango(inicio, primera_completa), piso_hora(inicio))
        flux = f'''
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {flux_tiempo(primera_completa)}, stop: {flux_tiempo(hora_actual)})
  |> filter(fn: (r) => r._measurement == "{ENERGIA_HORARIA}" and r._field == "kwh")
'''
        for tabla in almacen.consultar(flux):
            for r in tabla.records:
                if r.values.get("nodo") and r.get_value() is not None:
                    sumar({r.values["nodo"]: r.get_value()}, r.get_time())
        sumar(energia_en_rango(hora_actual, ahora), hora_actual)

    hasta = estado_energia["hasta"]
    completo = hasta is not None and hasta >= hora_actual
    return por_nodo, por_hora, completo


def calcular_energia(periodo: str) -> dict:
    inicio = inicio_periodo(periodo)
    por_nodo, por_hora, completo = energia_desde(inicio)
    return {
        "periodo": periodo,
        "desde": inicio.isoformat(),
        "completo": completo,   # False mientras la tarea de fondo se pone al dia
        "total_kwh": round(sum(por_nodo.values()), 4),
        "nodos": {n: round(v, 4) for n, v in sorted(por_nodo.items())},
        "horas": [{"inicio": h.isoformat(), "valores": {n: round(v, 5) for n, v in por_hora[h].items()}}
                  for h in sorted(por_hora)],
    }


@app.get("/api/energia")
async def energia(periodo: str = Query("hoy", pattern="^(hoy|semana)$"), _: dict = Depends(usuario_actual)):
    """kWh consumidos hoy o en los ultimos 7 dias (cache de 30 s)."""
    guardado = cache_energia.get(periodo)
    if guardado and time.time() - guardado[0] < CACHE_ENERGIA_S:
        return guardado[1]
    try:
        resultado = await asyncio.to_thread(calcular_energia, periodo)
    except Exception as e:
        log.error("Calculo de energia fallo: %s", e)
        raise HTTPException(status_code=503, detail="InfluxDB no disponible")
    cache_energia[periodo] = (time.time(), resultado)
    return resultado


@app.get("/api/eventos")
def get_eventos(limite: int = Query(50, ge=1, le=100), _: dict = Depends(requiere_tecnico)):
    return {"eventos": list(eventos_recientes)[:limite]}


# Modelos de IA (modelos.py)
async def tarea_modelos_ia() -> None:
    """Cada 5 minutos: tabla horaria, anomalias de las horas cerradas y prediccion."""
    await asyncio.sleep(30)   # deja arrancar el resto del backend
    while True:
        try:
            nuevas = await asyncio.to_thread(ia.ciclo)
            for alerta in nuevas:
                await manager.broadcast({"type": "alerta_ia", "data": alerta})
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("IA: la tarea fallo (%s)", e)
        await asyncio.sleep(INTERVALO_IA_S)


@app.get("/api/prediccion")
def obtener_prediccion(_: dict = Depends(usuario_actual)):
    """Prediccion por aparato: estimado de hoy y de los proximos 7 dias (kWh).
    El valor en pesos lo calcula el frontend con la tarifa del usuario."""
    return ia.resumen_prediccion()


@app.get("/api/alertas")
def obtener_alertas(limite: int = Query(50, ge=1, le=300), dias: int = Query(7, ge=1, le=30),
                    aparato: Optional[str] = Query(None, max_length=32),
                    _: dict = Depends(usuario_actual)):
    return ia.listar_alertas(limite=limite, dias=dias, aparato=aparato)


@app.get("/api/modelos")
def estado_modelos(_: dict = Depends(requiere_tecnico)):
    return ia.estado()


@app.post("/api/modelos/recargar")
async def recargar_modelos(_: dict = Depends(requiere_tecnico)):
    ok = await asyncio.to_thread(ia.cargar)
    if not ok:
        raise HTTPException(status_code=500, detail=f"No se pudieron cargar los modelos: {ia.error}")
    await asyncio.to_thread(ia.ciclo)
    return {"status": "ok", "modelos": ia.estado()}


# WebSocket
@app.websocket("/ws/nodes")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    # El token llega como parametro: ws://.../ws/nodes?token=...
    if auth.token_websocket_valido(token) is None:
        await websocket.accept()
        await websocket.close(code=4401, reason="Sesion invalida o vencida")
        return
    await manager.connect(websocket)
    try:
        await websocket.send_json({
            "type": "snapshot",
            "data": [latest_readings[n].model_dump() for n in sorted(latest_readings)],
        })
        await websocket.send_json({"type": "estados", "data": [estados_nodos[n] for n in sorted(estados_nodos)]})
        await websocket.send_json({"type": "cargas", "data": [cargas_nodos[n] for n in sorted(cargas_nodos)]})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
