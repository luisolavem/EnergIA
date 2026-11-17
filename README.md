# EnergIA

Sistema de monitoreo del consumo eléctrico residencial con IoT y Machine Learning, desarrollado como trabajo de grado en un hogar de Popayán.

Cinco nodos ESP32 con sensores PZEM-004T miden cada 2 segundos el voltaje, la corriente y la potencia de un electrodoméstico. Envían las lecturas por MQTT a una Raspberry Pi, que las guarda en InfluxDB y las sirve a un dashboard web. Sobre esos datos, un modelo detecta consumos anómalos por aparato y otro predice el consumo de la semana siguiente.

| Nodo | Electrodoméstico |
|---|---|
| nodo_1 | Nevera 1 |
| nodo_2 | Nevera 2 |
| nodo_3 | Router |
| nodo_4 | PC |
| nodo_5 | Televisor y decodificador |

## Contenido del repositorio

```
├── firmware/
│   ├── v1/nodo_energia_esp32_v1.ino    primera versión de los nodos
│   └── v2/nodo_energia_esp32_v2.ino    versión final, instalada en los cinco nodos
├── backend/
│   ├── main.py                         API FastAPI: MQTT, InfluxDB, REST y WebSocket
│   ├── modelos.py                      carga los modelos y calcula predicción y alertas
│   ├── auth.py                         inicio de sesión con JWT y roles
│   ├── base_datos.py                   usuarios y configuración de los nodos (SQLite)
│   ├── crear_usuario.py                crea y administra las cuentas del dashboard
│   ├── requirements.txt
│   ├── .env.example                    plantilla de la configuración
│   └── despliegue/
│       ├── energia-backend.service     servicio systemd de la Raspberry
│       └── mosquitto.conf              configuración del broker MQTT
├── frontend/                           dashboard en React
├── preparacion_datos/                  exportación, completado y normalización del dataset
├── notebooks/                          entrenamiento y evaluación de los modelos (Colab)
├── modelos_entrenados/                 modelos desplegados en la Raspberry
├── pruebas/pruebas_capitulo3.py        mediciones de la evaluación (Capítulo 3)
└── resultados/raspberry/               salidas de esas mediciones
```

El conjunto de datos no está en el repositorio por su tamaño. Se encuentra en
[Google Drive](https://drive.google.com/drive/folders/1elM213b-uulqLfFFP1w3J4KF4dxNvpI1?usp=drive_link).

## Arquitectura

```
ESP32 + PZEM-004T ──MQTT──> Mosquitto ──> backend (FastAPI) ──> InfluxDB
     (5 nodos)               (Raspberry Pi)        │
                                                   ├── modelos (predicción y anomalías)
                                                   └── REST / WebSocket ──> dashboard React
```

Tópicos MQTT de cada nodo (`<nodo>` va de `nodo_1` a `nodo_5`):

| Tópico | Contenido |
|---|---|
| `energia/<nodo>/telemetria` | voltaje, corriente y potencia cada 2 s, solo con el aparato encendido |
| `energia/<nodo>/estado` | conectado / desconectado (mensaje retenido y LWT) |
| `energia/<nodo>/carga` | aparato encendido o apagado |
| `energia/<nodo>/cmd` | órdenes del backend al nodo, por ejemplo recargar la configuración |
| `energia/<nodo>/diagnostico` | datos de diagnóstico del nodo |

Si la conexión MQTT se pierde, el nodo reenvía por HTTP (`POST /api/nodes/data`) las lecturas de los últimos 45 segundos.

## Firmware

Se carga desde Arduino IDE con el soporte para ESP32 instalado.

Librerías necesarias: PubSubClient, ArduinoJson y PZEM-004T-v30. Las demás vienen con el soporte para ESP32.

Antes de cargarlo a cada nodo:

1. Cambiar `NODO_ID` por el nodo que corresponde (`nodo_1` a `nodo_5`).
2. Escribir el nombre y la clave de la red WiFi en `registrarRedesWiFi()`. En esta copia aparecen como `SSID_RED` y `CLAVE_RED`.
3. Revisar `IP_SERVIDOR_RESPALDO`. El nodo busca primero la Raspberry como `raspberrypi.local` y usa esa IP solo si no la encuentra.

## Servidor (Raspberry Pi)

Requiere Python 3.11 o superior, Mosquitto e InfluxDB 2.

**1. Instalar dependencias**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**2. Configurar**

```bash
cp .env.example .env
```

Completar en `.env` el token de InfluxDB (`INFLUX_TOKEN`) y una clave para firmar las sesiones (`JWT_SECRETO`). Con `python3 -c "import secrets; print(secrets.token_hex(32))"` se genera una.

El archivo `.env` y la base de usuarios (`energia.db`) no se suben al repositorio.

**3. Copiar los modelos**

El backend lee los modelos de la carpeta `backend/modelos/`:

```bash
mkdir -p modelos
cp ../modelos_entrenados/* modelos/
```

**4. Crear una cuenta**

Para entrar al dashboard se necesita al menos una cuenta con rol técnico. La contraseña se pide por teclado:

```bash
python crear_usuario.py crear --correo tecnico@energia.local --nombre "Tecnico" --rol tecnico
```

Con `listar`, `contrasena`, `desactivar` y `activar` se administran las cuentas. Un técnico también puede hacerlo desde el dashboard, en Configuración > Usuarios.

**5. Ejecutar**

Para pruebas:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Como servicio, para que arranque solo al encender la Raspberry:

```bash
sudo cp despliegue/energia-backend.service /etc/systemd/system/
sudo systemctl enable --now energia-backend
journalctl -u energia-backend -f        # ver el registro
```

En el archivo `.service`, las rutas `WorkingDirectory` y `ExecStart` deben coincidir con las de la instalación.

### Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/nodes/data` | última lectura de cada nodo |
| GET | `/api/nodes/estado` | estado de conexión de los nodos |
| POST | `/api/nodes/data` | recepción de lecturas por HTTP (respaldo de MQTT) |
| GET / PUT | `/api/nodes/{node_id}/config` | configuración de un nodo |
| GET | `/api/historico` | lecturas en un rango de fechas |
| GET | `/api/energia/resumen` | energía y costo por aparato |
| GET | `/api/prediccion` | consumo estimado del día y de la semana |
| GET | `/api/alertas` | alertas del detector de anomalías |
| GET | `/api/eventos` | cortes de energía, desconexiones y reinicios |
| POST | `/api/modelos/recargar` | carga una versión nueva de los modelos sin reiniciar |
| WS | `/ws/nodes` | lecturas en tiempo real |

La lista completa con sus parámetros está en `http://<ip-raspberry>:8000/docs`.

## Dashboard

```bash
cd frontend
npm install
npm run dev
```

Para producción, `npm run build` genera la carpeta `dist/`.

## Preparación de los datos

Los scripts se ejecutan en orden. Cada paso deja una carpeta nueva y no modifica la anterior.

| Paso | Script | Resultado |
|---|---|---|
| 1 | `exportar_crudos.py` | copia de los datos crudos de InfluxDB con huellas SHA-256 |
| 2 | `imputar_datos.py <crudos> <salida>` | completado por minuto de los intervalos sin registro, con trazabilidad |
| 2b | `imputar_lecturas_2s.py <crudos> <paso2> <salida>` | lecturas cada 2 s de los minutos completados |
| 3 | `normalizar_2s.py <paso2b> <salida>` | división cronológica y normalización MinMax por aparato |

El paso 1 se ejecuta en la Raspberry, desde la carpeta del backend, porque lee de InfluxDB.

## Modelos

Los notebooks están hechos para Google Colab. Antes de ejecutarlos, se sube a Drive el archivo de lecturas (`lecturas_2s_1.csv`) y se ajusta `RUTA_DRIVE` en la primera celda de código.

- `entrenar_modelos_EnergIA.ipynb` entrena el detector de anomalías (un Isolation Forest por aparato) y el modelo de predicción semanal (Random Forest recursivo). Genera `modelos_EnergIA.zip`.
- `evaluar_anomalias_EnergIA.ipynb` compara Isolation Forest, LOF, COF y CBLOF con anomalías sintéticas. Solo evalúa: no cambia los modelos del sistema.

Para actualizar los modelos en la Raspberry, se copia el contenido del zip a `backend/modelos/` y se llama `POST /api/modelos/recargar`.

`variables.py` calcula las variables de entrada. El mismo archivo se usa en el notebook y en el backend, así que los dos deben ser la misma versión.

## Pruebas

`pruebas/pruebas_capitulo3.py` contiene las mediciones de la evaluación. Se ejecuta en la Raspberry, desde la carpeta del backend, para que lea el mismo `.env`:

```bash
python pruebas_capitulo3.py ayuda
```

| Comando | Qué mide |
|---|---|
| `latencia --dias 7` | latencia de entrega de las lecturas |
| `perdidas --minutos 60` | pérdida de mensajes MQTT |
| `caidas --dias 45` | desconexiones de los nodos y tiempo de recuperación |
| `resiliencia --desde ... --hasta ...` | comportamiento en un intervalo con cortes |
| `alertas --dias 30` | alertas generadas por el detector |
| `semanal` | error de la predicción semanal en operación |

Cada comando guarda su salida en `resultados/<comando>_<fecha>.txt`. En `resultados/raspberry/` están las salidas usadas en el documento.

## Autor

Luis Enrique Olave
