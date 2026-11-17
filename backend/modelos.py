"""
Modelos de Machine Learning de EnergIA en el backend.

Usa los archivos exportados por el notebook de entrenamiento (carpeta modelos/):
  modelo_prediccion.joblib   Random Forest: kWh por aparato y hora, encadenado por
                             bloques de 24 h hasta 7 dias
  modelo_anomalias.joblib    un Isolation Forest por aparato con su umbral
  modelos_info.json          versiones, variables, metricas y umbrales
  variables.py               calculo de variables compartido con el notebook

Cada 5 minutos (tarea de fondo de main.py):
  1. Promedia por minuto las lecturas de InfluxDB y arma la tabla horaria de los
     ultimos 9 dias. Un minuto sin lectura cuenta como 0 W si el nodo estaba
     conectado; si estaba desconectado, esa hora del aparato queda sin datos.
  2. Revisa las horas cerradas con el Isolation Forest y registra las alertas
     (anomalia_ia).
  3. Predice los proximos 7 dias (prediccion_consumo). La prediccion de medianoche
     se guarda tambien en prediccion_dia y prediccion_semana.
  4. Al terminar cada semana predicha guarda su error en evaluacion_semana.

Prueba por terminal, sin escribir en InfluxDB:
  python modelos.py
"""

import importlib.util
import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional

import numpy as np
import pandas as pd
from influxdb_client import Point, WritePrecision

log = logging.getLogger("energia.modelos")

CARPETA_MODELOS = Path(__file__).with_name("modelos")
ARCHIVOS = ("modelo_prediccion.joblib", "modelo_anomalias.joblib", "modelos_info.json", "variables.py")

DIAS_HISTORIA = 9                 # tabla horaria en memoria (la prediccion necesita 8 dias)
HORAS_RECALCULO = 3               # se recalculan las ultimas horas por si llegan datos tardios
MIN_MINUTOS_CON_DATOS = 50        # una hora con menos minutos con lecturas = sin datos (backend caido)
MAX_MINUTOS_NODO_CAIDO = 10       # si un nodo estuvo desconectado mas minutos, esa hora del aparato = sin datos
DIAS_ESTADOS = 30                 # cuanto atras se busca el ultimo estado conocido de cada nodo
MARGEN_ANOMALIA = pd.Timedelta(minutes=10)   # espera tras cerrar la hora antes de revisarla
HORAS_ANOMALIA_AL_INICIAR = 24    # al arrancar solo se revisan las ultimas 24 horas
DIAS_ALERTAS = 30
MAX_ALERTAS = 300
DIAS_PREDICCION_DIA = 14
DIAS_PREDICCION_SEMANA = 21
DIAS_EVALUACION_SEMANA = 120
MARGEN_EVALUACION = pd.Timedelta(minutes=30)  # espera tras cerrar la semana antes de evaluarla

MED_PREDICCION = "prediccion_consumo"
MED_PREDICCION_DIA = "prediccion_dia"
MED_ANOMALIA = "anomalia_ia"
MED_PREDICCION_SEMANA = "prediccion_semana"
MED_EVALUACION_SEMANA = "evaluacion_semana"


def _flux_tiempo(momento: datetime) -> str:
    return momento.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _importar_variables(ruta: Path):
    """Carga modelos/variables.py como modulo (el mismo archivo del notebook)."""
    spec = importlib.util.spec_from_file_location("variables_energia", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


class ServicioIA:
    def __init__(self, consultar: Callable, escribir: Callable, bucket: str, medicion: str,
                 zona: timezone, carpeta: Path = CARPETA_MODELOS) -> None:
        self.consultar = consultar          # funcion(flux) -> tablas de InfluxDB
        self.escribir = escribir            # funcion(lista de Point)
        self.bucket = bucket
        self.medicion = medicion
        self.zona = zona
        self.carpeta = Path(carpeta)
        self._candado = threading.Lock()    # el ciclo y la recarga no corren a la vez
        self.cargado = False
        self.error: Optional[str] = "Los modelos aun no se han cargado"
        self.info: dict = {}
        self.V = None
        self.modelo = None
        self.detectores: Dict[str, dict] = {}
        self.version_instalada: Optional[str] = None
        self._reiniciar_estado()

    def _reiniciar_estado(self) -> None:
        self.horaria = pd.DataFrame()
        self.calculada_hasta: Optional[pd.Timestamp] = None
        self.evaluadas: set = set()
        self.alertas: List[dict] = []
        self.prediccion: Optional[dict] = None
        self.pred_dia = pd.DataFrame({"fecha_hora": pd.Series(dtype="datetime64[ns]"),
                                      "aparato": pd.Series(dtype=object), "kwh_pred": pd.Series(dtype=float)})
        self.pred_semana = pd.DataFrame({"fecha_hora": pd.Series(dtype="datetime64[ns]"),
                                         "aparato": pd.Series(dtype=object), "kwh_pred": pd.Series(dtype=float),
                                         "dia_horizonte": pd.Series(dtype=int),
                                         "origen": pd.Series(dtype="datetime64[ns]")})
        self.semanas_evaluadas: List[dict] = []
        self.ultima_ejecucion: Optional[str] = None
        self.duracion_ciclo_s: Optional[float] = None
        self.error_ciclo: Optional[str] = None
        self._hora_escrita: Optional[pd.Timestamp] = None

    # Tiempo: InfluxDB guarda en UTC; los modelos trabajan en hora de Colombia
    def _ahora_local(self) -> pd.Timestamp:
        return pd.Timestamp(datetime.now(self.zona).replace(tzinfo=None))

    def _a_utc(self, local: pd.Timestamp) -> datetime:
        return pd.Timestamp(local).tz_localize(self.zona).tz_convert("UTC").to_pydatetime()

    def _iso(self, local: pd.Timestamp) -> str:
        return pd.Timestamp(local).tz_localize(self.zona).isoformat()

    @property
    def horizonte(self) -> int:
        """Horas que se predicen: 168 con los modelos semanales; 24 con los anteriores."""
        if self.V is not None and hasattr(self.V, "prediccion_recursiva"):
            return int(self.info.get("prediccion", {}).get("horizonte_horas", 168))
        return 24

    def _nodo(self, aparato: str) -> str:
        return {a: n for n, a in self.V.NODO_A_APARATO.items()}.get(aparato, "")

    # Carga
    def cargar(self) -> bool:
        with self._candado:
            self.cargado = False
            try:
                import joblib
                import sklearn
                faltan = [f for f in ARCHIVOS if not (self.carpeta / f).exists()]
                if faltan:
                    raise FileNotFoundError(f"faltan {', '.join(faltan)} en {self.carpeta}")
                info = json.loads((self.carpeta / "modelos_info.json").read_text(encoding="utf-8"))
                V = _importar_variables(self.carpeta / "variables.py")
                self.version_instalada = sklearn.__version__
                entrenada = info.get("versiones", {}).get("scikit-learn")
                if entrenada and entrenada != sklearn.__version__:
                    log.warning("Los modelos se entrenaron con scikit-learn %s y aqui esta %s. "
                                "Instala la misma version: pip install scikit-learn==%s",
                                entrenada, sklearn.__version__, entrenada)
                modelo = joblib.load(self.carpeta / "modelo_prediccion.joblib")
                detectores = joblib.load(self.carpeta / "modelo_anomalias.joblib")

                esperadas = list(info["prediccion"]["variables"])
                if list(V.VARIABLES_PREDICCION) != esperadas:
                    raise ValueError("variables.py no coincide con modelos_info.json (vuelve a copiar el zip completo)")
                nombres = getattr(modelo, "feature_names_in_", None)
                if nombres is not None and list(nombres) != esperadas:
                    raise ValueError("el modelo de prediccion espera otras variables")
                sin_detector = [a for a in V.APARATOS if a not in detectores]
                if sin_detector:
                    raise ValueError(f"no hay detector de anomalias para {', '.join(sin_detector)}")

                self.info, self.V, self.modelo, self.detectores = info, V, modelo, detectores
                self._reiniciar_estado()
                self._restaurar()
                self.cargado, self.error = True, None
                log.info("Modelos de IA cargados: %s (entrenado el %s con datos hasta %s)",
                         info["prediccion"].get("tipo"), info.get("creado"), info.get("datos", {}).get("hasta"))
            except Exception as e:
                self.error = f"{type(e).__name__}: {e}"
                log.error("Modelos de IA no cargados: %s", self.error)
            return self.cargado

    def _restaurar(self) -> None:
        """Recupera de InfluxDB las alertas y las predicciones de medianoche guardadas."""
        try:
            flux = f'''
from(bucket: "{self.bucket}")
  |> range(start: -{DIAS_ALERTAS}d)
  |> filter(fn: (r) => r._measurement == "{MED_ANOMALIA}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
'''
            alertas = []
            for tabla in self.consultar(flux):
                for r in tabla.records:
                    v = r.values
                    inicio = pd.Timestamp(r.get_time()).tz_convert(self.zona).tz_localize(None)
                    alertas.append(self._alerta_dict(v.get("aparato", ""), inicio, v.get("tipo", "inusual"),
                                                     v.get("descripcion", ""), v.get("kwh"), v.get("normal_kwh"),
                                                     v.get("puntaje"), v.get("umbral"), v.get("detectada")))
            self.alertas = sorted(alertas, key=lambda a: a["inicio"], reverse=True)[:MAX_ALERTAS]

            flux = f'''
from(bucket: "{self.bucket}")
  |> range(start: -{DIAS_PREDICCION_DIA}d)
  |> filter(fn: (r) => r._measurement == "{MED_PREDICCION_DIA}" and r._field == "kwh")
'''
            filas = [(pd.Timestamp(r.get_time()).tz_convert(self.zona).tz_localize(None),
                      r.values.get("aparato"), r.get_value())
                     for tabla in self.consultar(flux) for r in tabla.records]
            if filas:
                pd_dia = pd.DataFrame(filas, columns=["fecha_hora", "aparato", "kwh_pred"])
                pd_dia["fecha_hora"] = pd_dia["fecha_hora"].astype("datetime64[ns]")
                self.pred_dia = pd_dia
            flux = f'''
from(bucket: "{self.bucket}")
  |> range(start: -{DIAS_PREDICCION_SEMANA}d)
  |> filter(fn: (r) => r._measurement == "{MED_PREDICCION_SEMANA}" and r._field == "kwh")
'''
            filas = []
            for tabla in self.consultar(flux):
                for r in tabla.records:
                    t = pd.Timestamp(r.get_time()).tz_convert(self.zona).tz_localize(None)
                    d = int(r.values.get("dia_horizonte", 1))
                    filas.append((t, r.values.get("aparato"), r.get_value(), d,
                                  t.normalize() - pd.Timedelta(days=d - 1)))
            if filas:
                ps = pd.DataFrame(filas, columns=["fecha_hora", "aparato", "kwh_pred", "dia_horizonte", "origen"])
                ps["fecha_hora"] = ps["fecha_hora"].astype("datetime64[ns]")
                ps["origen"] = ps["origen"].astype("datetime64[ns]")
                self.pred_semana = ps

            flux = f'''
from(bucket: "{self.bucket}")
  |> range(start: -{DIAS_EVALUACION_SEMANA}d)
  |> filter(fn: (r) => r._measurement == "{MED_EVALUACION_SEMANA}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
'''
            semanas = []
            for tabla in self.consultar(flux):
                for r in tabla.records:
                    v = r.values
                    origen = pd.Timestamp(r.get_time()).tz_convert(self.zona).tz_localize(None)
                    semanas.append({"origen": f"{origen:%Y-%m-%d}", "real_kwh": v.get("real_kwh"),
                                    "predicho_kwh": v.get("predicho_kwh"), "error_pct": v.get("error_pct"),
                                    "mae_wh": v.get("mae_wh"),
                                    "error_por_dia_pct": [v.get(f"error_d{k}") for k in range(1, 8)]})
            self.semanas_evaluadas = sorted(semanas, key=lambda x: x["origen"])
            log.info("IA: %d alerta(s), %d dia(s) de prediccion y %d semana(s) evaluadas recuperados",
                     len(self.alertas),
                     self.pred_dia.fecha_hora.dt.normalize().nunique() if len(self.pred_dia) else 0,
                     len(self.semanas_evaluadas))
        except Exception as e:
            log.warning("IA: no se pudo recuperar el historial de InfluxDB (%s)", e)

    # Ciclo (se ejecuta en un hilo cada 5 minutos)
    def ciclo(self) -> List[dict]:
        """Actualiza la tabla horaria, revisa anomalias y predice. Devuelve las alertas nuevas."""
        if not self.cargado:
            return []
        with self._candado:
            t0 = time.monotonic()
            nuevas: List[dict] = []
            try:
                hora_actual = self._ahora_local().floor("h")
                inicio_hist = hora_actual - pd.Timedelta(days=DIAS_HISTORIA)
                if self.calculada_hasta is None:
                    desde = inicio_hist
                else:
                    desde = max(inicio_hist, min(self.calculada_hasta, hora_actual) - pd.Timedelta(hours=HORAS_RECALCULO))
                while desde < hora_actual:          # por bloques de un dia para no cargar la Raspberry
                    hasta = min(desde + pd.Timedelta(hours=24), hora_actual)
                    self._actualizar_horas(desde, hasta)
                    desde = hasta
                self.calculada_hasta = hora_actual
                if len(self.horaria):
                    self.horaria = self.horaria[self.horaria.fecha_hora >= inicio_hist].reset_index(drop=True)
                nuevas = self._detectar(hora_actual)
                self._predecir(hora_actual)
                self._evaluar_semanas()
                self.error_ciclo = None
            except Exception as e:
                self.error_ciclo = f"{type(e).__name__}: {e}"
                log.warning("IA: el ciclo fallo (%s)", self.error_ciclo)
            self.ultima_ejecucion = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self.duracion_ciclo_s = round(time.monotonic() - t0, 1)
            return nuevas

    def _leer_minutos(self, desde: pd.Timestamp, hasta: pd.Timestamp) -> pd.DataFrame:
        """Promedio por minuto de potencia y voltaje de cada nodo (lo hace InfluxDB)."""
        flux = f'''
from(bucket: "{self.bucket}")
  |> range(start: {_flux_tiempo(self._a_utc(desde))}, stop: {_flux_tiempo(self._a_utc(hasta))})
  |> filter(fn: (r) => r._measurement == "{self.medicion}" and (r._field == "potencia" or r._field == "voltaje"))
  |> filter(fn: (r) => (r._field == "potencia" and r._value >= 0.0 and r._value <= 23000.0) or
                       (r._field == "voltaje" and r._value >= 80.0 and r._value <= 260.0))
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false, timeSrc: "_start")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
'''
        filas = []
        for tabla in self.consultar(flux):
            for r in tabla.records:
                aparato = self.V.NODO_A_APARATO.get(r.values.get("nodo"))
                if aparato:
                    filas.append((r.get_time(), aparato, r.values.get("potencia"), r.values.get("voltaje")))
        df = pd.DataFrame(filas, columns=["t", "aparato", "potencia", "voltaje"])
        df["fecha_hora"] = pd.to_datetime(df["t"], utc=True).dt.tz_convert(self.zona).dt.tz_localize(None)
        df["potencia"] = pd.to_numeric(df["potencia"], errors="coerce")
        df["voltaje"] = pd.to_numeric(df["voltaje"], errors="coerce")
        return df.drop(columns="t")

    def _estados(self, desde: pd.Timestamp, hasta: pd.Timestamp) -> pd.DataFrame:
        """Cambios de conexion de cada nodo (online / offline del testamento MQTT)."""
        flux = f'''
from(bucket: "{self.bucket}")
  |> range(start: {_flux_tiempo(self._a_utc(desde - pd.Timedelta(days=DIAS_ESTADOS)))}, stop: {_flux_tiempo(self._a_utc(hasta))})
  |> filter(fn: (r) => r._measurement == "estado_nodo" and r._field == "estado")
'''
        filas = []
        for tabla in self.consultar(flux):
            for r in tabla.records:
                aparato = self.V.NODO_A_APARATO.get(r.values.get("nodo"))
                if aparato:
                    filas.append((r.get_time(), aparato, str(r.get_value())))
        df = pd.DataFrame(filas, columns=["t", "aparato", "estado"])
        df["fecha_hora"] = (pd.to_datetime(df["t"], utc=True).dt.tz_convert(self.zona).dt.tz_localize(None)
                            .astype("datetime64[ns]"))
        return df.drop(columns="t").sort_values("fecha_hora")

    def _minutos_nodo_caido(self, m: pd.DataFrame, desde, hasta) -> pd.Series:
        """Minutos sin lectura con el nodo desconectado: falta de datos, no aparato apagado."""
        try:
            est = self._estados(desde, hasta)
        except Exception as e:
            log.warning("IA: no se pudo leer el estado de los nodos (%s)", e)
            est = pd.DataFrame(columns=["aparato", "estado", "fecha_hora"])
        sin_lectura = m["potencia"].isna()
        if est.empty:
            return pd.Series(False, index=m.index)
        mm = m[["aparato", "fecha_hora"]].assign(i=np.arange(len(m)))
        mm["fecha_hora"] = mm["fecha_hora"].astype("datetime64[ns]")
        j = pd.merge_asof(mm.sort_values("fecha_hora"), est, on="fecha_hora", by="aparato", direction="backward")
        estado = j.set_index("i").sort_index()["estado"]
        conectado = (estado.isna() | (estado == "online")).to_numpy()
        return pd.Series(sin_lectura.to_numpy() & ~conectado, index=m.index)

    def _actualizar_horas(self, desde: pd.Timestamp, hasta: pd.Timestamp) -> None:
        """Tabla horaria de [desde, hasta), con el mismo procedimiento del notebook."""
        V = self.V
        inicio = desde - pd.Timedelta(minutes=1)    # el minuto anterior, para contar bien los arranques
        crudo = self._leer_minutos(inicio, hasta)
        minutos = pd.date_range(inicio, hasta, freq="min", inclusive="left")
        rejilla = pd.MultiIndex.from_product([V.APARATOS, minutos], names=["aparato", "fecha_hora"])
        m = (crudo.groupby(["aparato", "fecha_hora"])[["potencia", "voltaje"]].mean()
             .reindex(rejilla).reset_index())

        # Minutos con algun nodo reportando: si son pocos, el backend o la red estaban caidos
        con_datos = m.groupby("fecha_hora")["potencia"].count() > 0
        minutos_con_datos = con_datos.groupby(con_datos.index.floor("h")).sum()
        # Minutos en que cada nodo estuvo desconectado (no se cuentan como 0 W)
        caido = self._minutos_nodo_caido(m, inicio, hasta)
        caidos_hora = caido.groupby([m["aparato"], m["fecha_hora"].dt.floor("h")]).sum()
        caidos_hora.index.names = ["aparato", "fecha_hora"]

        # Minutos sin lectura = aparato apagado (0 W), como en el notebook
        m["potencia"] = m["potencia"].fillna(0.0)
        m["voltaje"] = m["voltaje"].fillna(m.groupby("fecha_hora")["voltaje"].transform("mean"))
        m["voltaje"] = m["voltaje"].interpolate(limit_direction="both")

        h = V.tabla_horaria_desde_minutos(m)
        h = h[(h.fecha_hora >= desde) & (h.fecha_hora < hasta) & (h.minutos == 60)].drop(columns="minutos")
        h["con_datos"] = h.fecha_hora.map(minutos_con_datos).fillna(0) >= MIN_MINUTOS_CON_DATOS
        nodo_caido = pd.MultiIndex.from_arrays([h.aparato, h.fecha_hora]).map(caidos_hora.to_dict().get)
        h["con_datos"] &= ~(pd.Series(nodo_caido, index=h.index).fillna(0) > MAX_MINUTOS_NODO_CAIDO)
        for c in ("kwh", "pct_encendido", "arranques", "p_encendido_media", "voltaje_medio"):
            h[c] = h[c].astype(float).where(h["con_datos"])

        if len(self.horaria):
            h = pd.concat([self.horaria[(self.horaria.fecha_hora < desde) | (self.horaria.fecha_hora >= hasta)], h])
        self.horaria = h.sort_values(["aparato", "fecha_hora"]).reset_index(drop=True)

    # Anomalias
    def _detectar(self, hora_actual: pd.Timestamp) -> List[dict]:
        if self.horaria.empty:
            return []
        ahora = self._ahora_local()
        limite = hora_actual - pd.Timedelta(hours=HORAS_ANOMALIA_AL_INICIAR)
        h = self.horaria
        cand = h[(h.fecha_hora >= limite) & (h.fecha_hora + pd.Timedelta(hours=1) + MARGEN_ANOMALIA <= ahora)
                 & h.kwh.notna()]
        cand = cand[[(a, t) not in self.evaluadas for a, t in zip(cand.aparato, cand.fecha_hora)]]
        self.evaluadas = {k for k in self.evaluadas if k[1] >= limite - pd.Timedelta(days=1)}
        if cand.empty:
            return []

        X = self.V.variables_anomalias(cand)
        ids = {a["id"] for a in self.alertas}
        nuevas: List[dict] = []
        for aparato, g in X.groupby("aparato"):
            det = self.detectores.get(aparato)
            if det is None:
                continue
            puntajes = det["modelo"].decision_function(g[self.V.VARIABLES_ANOMALIAS])
            for (_, fila), puntaje in zip(g.iterrows(), puntajes):
                self.evaluadas.add((aparato, fila.fecha_hora))
                if puntaje < det["umbral"]:
                    alerta = self._armar_alerta(fila, float(puntaje), float(det["umbral"]))
                    if alerta["id"] not in ids:
                        nuevas.append(alerta)

        if nuevas:
            puntos = [Point(MED_ANOMALIA).tag("nodo", a["nodo"]).tag("aparato", a["aparato"]).tag("tipo", a["tipo"])
                      .field("descripcion", a["descripcion"]).field("kwh", a["kwh"])
                      .field("normal_kwh", a["normal_kwh"] if a["normal_kwh"] is not None else -1.0)
                      .field("puntaje", a["puntaje"]).field("umbral", a["umbral"]).field("detectada", a["detectada"])
                      .time(self._a_utc(pd.Timestamp(a["inicio"]).tz_localize(None)), WritePrecision.S)
                      for a in nuevas]
            self.escribir(puntos)
            self.alertas = sorted(nuevas + self.alertas, key=lambda a: a["inicio"], reverse=True)[:MAX_ALERTAS]
            for a in nuevas:
                log.warning("IA · anomalia en %s: %s", a["aparato"], a["descripcion"])
        return nuevas

    def _armar_alerta(self, fila, puntaje: float, umbral: float) -> dict:
        """Describe la anomalia comparando la hora con la misma hora de otros dias."""
        a, t = fila.aparato, fila.fecha_hora
        hist = self.horaria[(self.horaria.aparato == a) & (self.horaria.fecha_hora.dt.hour == t.hour)
                            & (self.horaria.fecha_hora != t) & self.horaria.kwh.notna()]
        franja = f"entre las {t:%H}:00 y las {t + pd.Timedelta(hours=1):%H}:00"
        wh = fila.kwh * 1000
        normal_wh = hist.kwh.median() * 1000 if len(hist) else None
        normal_arr = hist.arranques.median() if len(hist) else None
        p_hist = hist.p_encendido_media[hist.p_encendido_media > 0]
        normal_p = p_hist.median() if len(p_hist) else None

        if normal_wh is None:
            tipo, texto = "inusual", f"Comportamiento poco común {franja} ({wh:.0f} Wh)."
        elif wh > max(normal_wh * 1.5, normal_wh + 5):
            tipo, texto = "consumo_alto", f"Consumió {wh:.0f} Wh {franja}; lo normal a esa hora es {normal_wh:.0f} Wh."
        elif wh < normal_wh * 0.5 and normal_wh - wh > 5:
            tipo, texto = "consumo_bajo", (f"Consumió {wh:.0f} Wh {franja}, menos de lo normal ({normal_wh:.0f} Wh). "
                                          "Revisa si quedó desconectado.")
        elif normal_arr is not None and fila.arranques > max(normal_arr * 2, normal_arr + 3):
            tipo, texto = "arranques", (f"Se encendió {fila.arranques:.0f} veces {franja}; "
                                        f"lo normal son {normal_arr:.0f}.")
        elif normal_p and fila.p_encendido_media > 0 and abs(fila.p_encendido_media - normal_p) / normal_p > 0.25:
            tipo, texto = "potencia", (f"Funcionó a {fila.p_encendido_media:.0f} W {franja}; "
                                       f"lo normal es {normal_p:.0f} W.")
        else:
            tipo, texto = "inusual", (f"Patrón de uso poco común {franja}: {wh:.0f} Wh "
                                      f"(lo normal a esa hora es {normal_wh:.0f} Wh), "
                                      f"encendido el {fila.pct_encendido:.0f} % del tiempo.")
        return self._alerta_dict(a, t, tipo, texto, float(fila.kwh),
                                 None if normal_wh is None else float(normal_wh) / 1000, puntaje, umbral,
                                 datetime.now(timezone.utc).isoformat(timespec="seconds"))

    def _alerta_dict(self, aparato, inicio, tipo, descripcion, kwh, normal_kwh, puntaje, umbral, detectada) -> dict:
        inicio = pd.Timestamp(inicio)
        if normal_kwh is not None and normal_kwh < 0:
            normal_kwh = None
        return {
            "id": f"{aparato}|{inicio:%Y-%m-%dT%H}",
            "aparato": aparato,
            "nodo": self._nodo(aparato),
            "inicio": self._iso(inicio),
            "fin": self._iso(inicio + pd.Timedelta(hours=1)),
            "tipo": tipo,
            "descripcion": descripcion,
            "kwh": None if kwh is None else round(float(kwh), 5),
            "normal_kwh": None if normal_kwh is None else round(float(normal_kwh), 5),
            "puntaje": None if puntaje is None else round(float(puntaje), 4),
            "umbral": None if umbral is None else round(float(umbral), 4),
            "detectada": detectada,
        }

    # Prediccion
    def _predecir(self, hora_actual: pd.Timestamp) -> None:
        V = self.V
        horas = pd.date_range(hora_actual - pd.Timedelta(days=DIAS_HISTORIA), hora_actual, freq="h", inclusive="left")
        rejilla = pd.MultiIndex.from_product([V.APARATOS, horas], names=["aparato", "fecha_hora"])
        base = self.horaria[["aparato", "fecha_hora", "kwh"]] if len(self.horaria) else \
            pd.DataFrame(columns=["aparato", "fecha_hora", "kwh"])
        hist = base.set_index(["aparato", "fecha_hora"]).reindex(rejilla).reset_index()
        hist["kwh"] = hist["kwh"].astype(float)

        # Horas sin datos (backend caido): se completan con lo tipico de ese aparato a esa hora
        ultimos8 = hist.fecha_hora >= hora_actual - pd.Timedelta(days=8)
        faltan = hist["kwh"].isna()
        cobertura = 1 - float(faltan[ultimos8].mean())
        if faltan[ultimos8].all():
            self.prediccion = None
            self.error_ciclo = "No hay datos de los ultimos 8 dias para predecir"
            return
        if faltan.any():
            tipico = hist.groupby(["aparato", hist.fecha_hora.dt.hour])["kwh"].transform("median")
            hist["kwh"] = hist["kwh"].fillna(tipico)
            hist["kwh"] = hist["kwh"].fillna(hist.groupby("aparato")["kwh"].transform("median")).fillna(0.0)
        hist = hist[["fecha_hora", "aparato", "kwh"]]

        if hasattr(V, "prediccion_recursiva"):
            tabla = V.prediccion_recursiva(self.modelo, hist, hora_actual, self.horizonte)
        else:   # modelos anteriores (24 horas)
            futuro = pd.DataFrame([(hora_actual + pd.Timedelta(hours=k), a, np.nan)
                                   for a in V.APARATOS for k in range(24)], columns=["fecha_hora", "aparato", "kwh"])
            t = V.variables_prediccion(pd.concat([hist, futuro], ignore_index=True))
            t = t[t.fecha_hora >= hora_actual].copy()
            t["kwh_pred"] = np.clip(self.modelo.predict(t[V.VARIABLES_PREDICCION]), 0, None)
            t["dia_horizonte"] = 1
            tabla = t[["fecha_hora", "aparato", "kwh_pred", "dia_horizonte"]]
        tabla = tabla.reset_index(drop=True)

        self.prediccion = {"desde": hora_actual, "tabla": tabla, "cobertura": round(cobertura, 3),
                           "generada": datetime.now(timezone.utc).isoformat(timespec="seconds")}

        if self._hora_escrita != hora_actual:
            def puntos_de(medicion, filas, con_horizonte=False):
                lista = []
                for r in filas.itertuples():
                    pt = Point(medicion).tag("nodo", self._nodo(r.aparato)).tag("aparato", r.aparato)
                    if con_horizonte:
                        pt = pt.tag("dia_horizonte", str(int(r.dia_horizonte)))
                    lista.append(pt.field("kwh", round(float(r.kwh_pred), 6))
                                 .time(self._a_utc(r.fecha_hora), WritePrecision.S))
                return lista

            puntos = puntos_de(MED_PREDICCION, tabla)
            # La de medianoche es la que se compara despues con lo real
            if hora_actual.hour == 0:
                dia1 = tabla[tabla.fecha_hora < hora_actual + pd.Timedelta(days=1)]
                puntos += puntos_de(MED_PREDICCION_DIA, dia1)
                limite = hora_actual - pd.Timedelta(days=DIAS_PREDICCION_DIA)
                previa = self.pred_dia[(self.pred_dia.fecha_hora >= limite) &
                                       (self.pred_dia.fecha_hora.dt.normalize() != hora_actual)]
                nueva = dia1[["fecha_hora", "aparato", "kwh_pred"]].assign(
                    fecha_hora=dia1.fecha_hora.astype("datetime64[ns]"))
                self.pred_dia = pd.concat([previa, nueva], ignore_index=True)

                if self.horizonte > 24:
                    puntos += puntos_de(MED_PREDICCION_SEMANA, tabla, con_horizonte=True)
                    limite = hora_actual - pd.Timedelta(days=DIAS_PREDICCION_SEMANA)
                    previa = self.pred_semana[(self.pred_semana.origen >= limite) &
                                              (self.pred_semana.origen != hora_actual)]
                    nueva = tabla.assign(fecha_hora=tabla.fecha_hora.astype("datetime64[ns]"),
                                         origen=pd.Timestamp(hora_actual))
                    nueva["origen"] = nueva["origen"].astype("datetime64[ns]")
                    self.pred_semana = pd.concat([previa, nueva], ignore_index=True)
            self.escribir(puntos)
            self._hora_escrita = hora_actual
            dia1_total = tabla[tabla.dia_horizonte == 1].kwh_pred.sum()
            log.info("IA: prediccion = %.2f kWh en 24 h y %.2f kWh en %d dias (historia completa al %.0f %%)",
                     dia1_total, tabla.kwh_pred.sum(), self.horizonte // 24, 100 * cobertura)

    def _evaluar_semanas(self) -> None:
        """Compara cada semana predicha a medianoche con lo medido, cuando la semana termina."""
        if self.pred_semana.empty or self.horaria.empty:
            return
        ahora = self._ahora_local()
        hechas = {s["origen"] for s in self.semanas_evaluadas}
        real = self.horaria[["fecha_hora", "aparato", "kwh"]].dropna()
        real = real.assign(fecha_hora=real.fecha_hora.astype("datetime64[ns]"))
        nuevas, puntos = [], []
        for origen, g in self.pred_semana.groupby("origen"):
            clave = f"{origen:%Y-%m-%d}"
            if clave in hechas or origen + pd.Timedelta(days=7) + MARGEN_EVALUACION > ahora:
                continue
            u = g.merge(real, on=["fecha_hora", "aparato"])
            if len(u) < 0.9 * len(g):      # semana con muchas horas sin datos: no se evalua
                continue
            r, p = float(u.kwh.sum()), float(u.kwh_pred.sum())
            por_dia = []
            for k in range(1, 8):
                d = u[u.dia_horizonte == k]
                rd, pdk = d.kwh.sum(), d.kwh_pred.sum()
                por_dia.append(round(float(100 * abs(rd - pdk) / rd), 2) if rd > 0 else None)
            fila = {"origen": clave, "real_kwh": round(r, 3), "predicho_kwh": round(p, 3),
                    "error_pct": round(100 * abs(r - p) / r, 2) if r > 0 else None,
                    "mae_wh": round(float(1000 * (u.kwh - u.kwh_pred).abs().mean()), 2),
                    "error_por_dia_pct": por_dia}
            nuevas.append(fila)
            pt = Point(MED_EVALUACION_SEMANA).field("real_kwh", fila["real_kwh"]).field("predicho_kwh", fila["predicho_kwh"]) \
                .field("mae_wh", fila["mae_wh"]).time(self._a_utc(origen), WritePrecision.S)
            if fila["error_pct"] is not None:
                pt = pt.field("error_pct", fila["error_pct"])
            for k, e in enumerate(por_dia, start=1):
                if e is not None:
                    pt = pt.field(f"error_d{k}", e)
            puntos.append(pt)
        if nuevas:
            self.escribir(puntos)
            self.semanas_evaluadas = sorted(self.semanas_evaluadas + nuevas, key=lambda x: x["origen"])
            for f in nuevas:
                log.info("IA: semana desde %s evaluada: real %.2f kWh, predicho %.2f kWh (error %s %%)",
                         f["origen"], f["real_kwh"], f["predicho_kwh"], f["error_pct"])

    # Lo que entregan los endpoints
    def resumen_prediccion(self) -> dict:
        """Hoy (consumido + lo que falta) y los proximos 7 dias: hoy y los 6 dias siguientes completos."""
        p = self.prediccion
        if not self.cargado or p is None:
            return {"disponible": False,
                    "motivo": self.error or self.error_ciclo or "Calculando la primera predicción"}
        t, desde = p["tabla"], p["desde"]
        hoy = desde.normalize()
        fin_hoy = hoy + pd.Timedelta(days=1)
        fin_semana = hoy + pd.Timedelta(days=7)
        h = self.horaria
        real_hoy = h[(h.fecha_hora >= hoy) & (h.fecha_hora < desde)] if len(h) else h
        resto_hoy = t[t.fecha_hora < fin_hoy]
        semana = t[t.fecha_hora < fin_semana]
        hay_semana = t.fecha_hora.max() >= fin_semana - pd.Timedelta(hours=1)

        def real_de(a=None):
            if not len(real_hoy):
                return 0.0
            g = real_hoy if a is None else real_hoy[real_hoy.aparato == a]
            return float(g.kwh.sum())

        aparatos = []
        for a in self.V.APARATOS:
            real_a = real_de(a)
            resto_a = float(resto_hoy[resto_hoy.aparato == a].kwh_pred.sum())
            fila = {"aparato": a, "nodo": self._nodo(a),
                    "kwh_24h": round(float(t[(t.aparato == a) & (t.dia_horizonte == 1)].kwh_pred.sum()), 4),
                    "hoy_consumido_kwh": round(real_a, 4),
                    "hoy_estimado_kwh": round(real_a + resto_a, 4)}
            if hay_semana:
                fila["semana_kwh"] = round(real_a + float(semana[semana.aparato == a].kwh_pred.sum()), 4)
            aparatos.append(fila)
        consumido = real_de()
        restante = float(resto_hoy.kwh_pred.sum())

        pred = self.info.get("prediccion", {})
        tipo = pred.get("tipo")
        metricas = pred.get("metricas", {}).get(tipo, {})
        por_dia = pred.get("error_por_dia_horizonte_pct", {}).get(tipo)
        respuesta = {
            "disponible": True,
            "generada": p["generada"],
            "desde": self._iso(desde),
            "hasta": self._iso(desde + pd.Timedelta(hours=int(t.fecha_hora.nunique()))),
            "horizonte_horas": int(t.fecha_hora.nunique()),
            "modelo": tipo,
            # error medido en el notebook: el del primer dia para el estimado de hoy
            "error_esperado_pct": por_dia[0] if por_dia else metricas.get("MAPE_diario_pct"),
            "historia_completa_pct": round(100 * p["cobertura"], 1),
            "total_24h_kwh": round(float(t[t.dia_horizonte == 1].kwh_pred.sum()), 4),
            "hoy": {"consumido_kwh": round(consumido, 4),
                    "restante_kwh": round(restante, 4),
                    "estimado_kwh": round(consumido + restante, 4)},
            "aparatos": aparatos,
            "horas": [{"inicio": self._iso(hora),
                       "total_kwh": round(float(g.kwh_pred.sum()), 5),
                       "aparatos": {r.aparato: round(float(r.kwh_pred), 5) for r in g.itertuples()}}
                      for hora, g in t.groupby("fecha_hora")],
        }
        if hay_semana:
            dias = []
            for k in range(7):
                dia = hoy + pd.Timedelta(days=k)
                g = semana[semana.fecha_hora.dt.normalize() == dia]
                valores = {a: float(g[g.aparato == a].kwh_pred.sum()) for a in self.V.APARATOS}
                if k == 0:
                    valores = {a: valores[a] + real_de(a) for a in self.V.APARATOS}
                dias.append({"fecha": f"{dia:%Y-%m-%d}", "kwh": round(sum(valores.values()), 4),
                             "aparatos": {a: round(v, 4) for a, v in valores.items()},
                             "incluye_consumido": k == 0})
            respuesta["semana"] = {
                "desde": self._iso(hoy), "hasta": self._iso(fin_semana),
                "total_kwh": round(sum(d["kwh"] for d in dias), 4),
                "error_esperado_pct": metricas.get("MAPE_semanal_pct"),
                "dias": dias,
            }
        return respuesta

    def listar_alertas(self, limite: int = 50, dias: int = 7, aparato: Optional[str] = None) -> dict:
        corte = (datetime.now(self.zona) - timedelta(days=dias)).isoformat()
        lista = [a for a in self.alertas
                 if pd.Timestamp(a["inicio"]) >= pd.Timestamp(corte) and (not aparato or a["aparato"] == aparato)]
        return {"activo": self.cargado, "total": len(lista), "alertas": lista[:limite]}

    def desempeno_real(self) -> dict:
        """Prediccion de medianoche frente a lo consumido, por dia completo (pruebas del capitulo 3)."""
        if self.pred_dia.empty or self.horaria.empty:
            return {"dias_evaluados": 0, "dias": []}
        real = self.horaria[["fecha_hora", "aparato", "kwh"]].dropna()
        u = self.pred_dia.merge(real, on=["fecha_hora", "aparato"])
        u["dia"] = u.fecha_hora.dt.normalize()
        completos = u.groupby("dia").size()
        u = u[u.dia.isin(completos[completos == 24 * len(self.V.APARATOS)].index)]
        if u.empty:
            return {"dias_evaluados": 0, "dias": []}
        dias = []
        for dia, g in u.groupby("dia"):
            r, p = g.kwh.sum(), g.kwh_pred.sum()
            dias.append({"fecha": f"{dia:%Y-%m-%d}", "real_kwh": round(float(r), 3), "predicho_kwh": round(float(p), 3),
                         "error_pct": round(float(100 * abs(r - p) / r), 1) if r > 0 else None,
                         "mae_wh": round(float(1000 * (g.kwh - g.kwh_pred).abs().mean()), 2)})
        por_aparato = {a: round(float(1000 * (g.kwh - g.kwh_pred).abs().mean()), 2) for a, g in u.groupby("aparato")}
        errores = [d["error_pct"] for d in dias if d["error_pct"] is not None]
        return {"dias_evaluados": len(dias),
                "mae_wh": round(float(1000 * (u.kwh - u.kwh_pred).abs().mean()), 2),
                "mape_diario_pct": round(float(np.mean(errores)), 1) if errores else None,
                "mae_wh_por_aparato": por_aparato,
                "dias": dias}

    def desempeno_semanal(self) -> dict:
        """Semanas predichas a medianoche cuyo consumo real ya se conoce."""
        semanas = self.semanas_evaluadas
        if not semanas:
            return {"semanas_evaluadas": 0, "semanas": []}
        errores = [s["error_pct"] for s in semanas if s["error_pct"] is not None]
        por_dia = []
        for k in range(7):
            v = [s["error_por_dia_pct"][k] for s in semanas
                 if len(s["error_por_dia_pct"]) > k and s["error_por_dia_pct"][k] is not None]
            por_dia.append(round(float(np.mean(v)), 2) if v else None)
        return {"semanas_evaluadas": len(semanas),
                "mape_semanal_pct": round(float(np.mean(errores)), 2) if errores else None,
                "mae_wh": round(float(np.mean([s["mae_wh"] for s in semanas])), 2),
                "error_por_dia_pct": por_dia,
                "semanas": semanas}

    def estado(self) -> dict:
        info = self.info
        pred = info.get("prediccion", {})
        h = self.horaria
        ultimos7 = h[h.fecha_hora >= h.fecha_hora.max() - pd.Timedelta(days=7)] if len(h) else h
        return {
            "cargados": self.cargado,
            "error": self.error,
            "error_ultimo_ciclo": self.error_ciclo,
            "carpeta": str(self.carpeta),
            "scikit_learn": {"instalado": self.version_instalada,
                             "entrenamiento": info.get("versiones", {}).get("scikit-learn"),
                             "coinciden": self.version_instalada == info.get("versiones", {}).get("scikit-learn")},
            "entrenamiento": {
                "creado": info.get("creado"),
                "datos": info.get("datos"),
                "prediccion": {k: pred.get(k) for k in ("tipo", "horizonte_horas", "estrategia", "evaluacion",
                                                        "metricas", "error_por_dia_horizonte_pct",
                                                        "validacion_cruzada_MAE_Wh", "metricas_por_aparato")},
                "anomalias": {k: info.get("anomalias", {}).get(k) for k in ("tipo", "percentil_umbral", "umbrales")},
            } if info else None,
            "ejecucion": {
                "ultima": self.ultima_ejecucion,
                "duracion_s": self.duracion_ciclo_s,
                "horas_en_memoria": int(h.fecha_hora.nunique()) if len(h) else 0,
                "horas_sin_datos_7d": int((~ultimos7.con_datos).sum() // max(1, len(self.V.APARATOS)))
                if len(ultimos7) else 0,
                "historia_completa_pct": round(100 * self.prediccion["cobertura"], 1) if self.prediccion else None,
                "alertas_30d": len(self.alertas),
            },
            "desempeno_real": self.desempeno_real() if self.cargado else None,
            "desempeno_semanal": self.desempeno_semanal() if self.cargado else None,
        }


# Prueba por terminal: lee InfluxDB y muestra resultados sin escribir nada.
if __name__ == "__main__":
    import os
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    ruta_env = Path(__file__).with_name(".env")
    if ruta_env.exists():
        for linea in ruta_env.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    from influxdb_client import InfluxDBClient
    cliente = InfluxDBClient(url=os.getenv("INFLUX_URL", "http://localhost:8086"),
                             token=os.getenv("INFLUX_TOKEN", ""), org=os.getenv("INFLUX_ORG", "EnergIA"),
                             timeout=120_000)
    q = cliente.query_api()
    servicio = ServicioIA(consultar=lambda flux: q.query(flux, org=os.getenv("INFLUX_ORG", "EnergIA")),
                          escribir=lambda puntos: None,          # prueba: no escribe
                          bucket=os.getenv("INFLUX_BUCKET", "datos_consumo_energetico"),
                          medicion="consumo_electrico", zona=timezone(timedelta(hours=-5)))
    if not servicio.cargar():
        sys.exit(f"\nNo se pudieron cargar los modelos: {servicio.error}")
    print("\nLeyendo 9 dias de InfluxDB (puede tardar un minuto la primera vez)...")
    nuevas = servicio.ciclo()
    if servicio.error_ciclo:
        sys.exit(f"\nEl ciclo fallo: {servicio.error_ciclo}")
    e = servicio.estado()
    print(f"\nscikit-learn instalado {e['scikit_learn']['instalado']} · entrenamiento "
          f"{e['scikit_learn']['entrenamiento']} · coinciden: {e['scikit_learn']['coinciden']}")
    print(f"Ciclo: {e['ejecucion']['duracion_s']} s · {e['ejecucion']['horas_en_memoria']} horas en memoria · "
          f"{e['ejecucion']['horas_sin_datos_7d']} horas sin datos en 7 dias")
    r = servicio.resumen_prediccion()
    print(f"\nPrediccion {r['desde'][:16]} -> {r['hasta'][:16]}  (historia completa {r['historia_completa_pct']} %)")
    for x in r["aparatos"]:
        sem = f" · 7 dias ~{x['semana_kwh']:.2f} kWh" if "semana_kwh" in x else ""
        print(f"  {x['aparato']:<8} {x['kwh_24h']:7.3f} kWh en 24 h · hoy ~{x['hoy_estimado_kwh']:.3f} kWh{sem}")
    print(f"  TOTAL    {r['total_24h_kwh']:7.3f} kWh · hoy ~{r['hoy']['estimado_kwh']:.3f} kWh")
    if "semana" in r:
        print("\nProximos 7 dias (hoy incluye lo ya consumido):")
        for d in r["semana"]["dias"]:
            print(f"  {d['fecha']}  {d['kwh']:6.2f} kWh")
        print(f"  TOTAL       {r['semana']['total_kwh']:6.2f} kWh")
    else:
        print("\nAVISO: estos modelos predicen solo 24 horas. Copia el zip nuevo del cuaderno semanal.")
    print(f"\nAnomalias en las ultimas 24 h: {len(nuevas)}")
    for a in nuevas:
        print(f"  {a['inicio'][:16]}  {a['aparato']:<8} {a['descripcion']}")
    print("\nTodo bien. Esta prueba no escribio nada en InfluxDB.")
    cliente.close()
