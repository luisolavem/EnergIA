// EnergIA - Firmware del nodo de medicion, version 1
// ESP32 + PZEM-004T v3.0. Primera version instalada en los nodos (seccion 2.2.3).
// Antes de cargarlo se definen NODO_ID y las redes WiFi.

#include <WiFi.h>
#include <WiFiMulti.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <HardwareSerial.h>
#include <LittleFS.h>
#include <sys/time.h>
#include <time.h>
#include <esp_system.h>

// Identidad y red
#define NODO_ID "nodo_1"          // nodo_1 a nodo_5, uno por aparato

const char*    HOST_SERVIDOR_MDNS   = "raspberrypi";   // raspberrypi.local
const char*    IP_SERVIDOR_RESPALDO = "192.168.1.28";
const uint16_t PUERTO_HTTP          = 8000;
const uint16_t PUERTO_MQTT          = 1883;

// Las redes WiFi se definen en registrarRedesWiFi().

// Parametros de operacion
// Valores por defecto; el backend los puede cambiar con GET /api/nodes/<id>/config.
struct Config {
  unsigned long muestreoMs       = 2000;   // lectura del PZEM
  unsigned long publicarActivoMs = 2000;
  float umbralCorrienteA         = 0.02f;  // por debajo = aparato en reposo
  uint8_t muestrasParaReposo     = 3;      // muestras bajo el umbral para pasar a reposo
  float umbralVoltajePct         = 5.0f;   // variacion de tension que fuerza una publicacion
};
Config cfg;

const size_t CAP_RAM         = 600;       // 600 x 24 B = 14,4 KB
const size_t BLOQUE_FLASH    = 60;        // lecturas por escritura en flash
const size_t LOTE_HTTP       = 50;        // lecturas por peticion de reenvio
const size_t MAX_FLASH_BYTES = 1000000;   // ~41.000 lecturas
const char*  ARCHIVO_PENDIENTES = "/pendientes.bin";

const String TOPICO_TELEMETRIA = String("energia/") + NODO_ID + "/telemetria";
const String TOPICO_ESTADO     = String("energia/") + NODO_ID + "/estado";
const String TOPICO_CMD        = String("energia/") + NODO_ID + "/cmd";
const String TOPICO_CARGA      = String("energia/") + NODO_ID + "/carga";

// Tipos y estado global
struct Lectura {
  int64_t  tsMs;
  uint32_t millisLocal;
  float v, i, p;
};

enum ResultadoEnvio { ENVIO_OK, ENVIO_REINTENTAR, ENVIO_DESCARTAR };

WiFiMulti     wifiMulti;
WiFiClient    clienteTcpMqtt;
PubSubClient  mqtt(clienteTcpMqtt);
HardwareSerial pzemSerial(2);
PZEM004Tv30   pzem(pzemSerial, 16, 17);

IPAddress ipServidor;
String    baseHttp;
char      ntpServidor[16] = "";    // global: configTime guarda el puntero
bool      mdnsIniciado = false;
bool      flashOk = false;

bool          wifiEstabaConectado = false;
unsigned long tIntentoWifi   = 0;
unsigned long tIntentoMqtt   = 0;
unsigned long esperaMqtt     = 0;
uint16_t      fallosMqtt     = 0;
bool          primeraConexionMqtt = true;

bool          pedirConfig    = false;
bool          configObtenida = false;
unsigned long tIntentoConfig = 0;

unsigned long tUltimaMuestra      = 0;
unsigned long tUltimaPublicacion  = 0;
bool          hayPublicacion      = false;
float         ultimoVPublicado    = 0;
bool          cargaActiva         = false;
uint8_t       muestrasBajoUmbral  = 0;
bool          cargaPorPublicar    = true;
int64_t       tsCambioCarga       = 0;

Lectura       bufRam[CAP_RAM];
size_t        ramCantidad    = 0;
size_t        offsetFlash    = 0;
unsigned long tUltimoReenvio = 0;
unsigned long esperaReenvio  = 1000;

uint32_t      secuenciaMqtt  = 0;   // numero de secuencia para medir perdidas
unsigned long enviadasMqtt = 0, guardadas = 0, descartadas = 0, erroresSensor = 0;

// Redes WiFi y utilidades de tiempo
void registrarRedesWiFi(WiFiMulti& multi) {
  // Credenciales de las redes WiFi del hogar (omitidas en esta copia)
  wifiMulti.addAP("SSID_RED", "CLAVE_RED");
}

bool horaSincronizada() {
  return time(nullptr) > 1700000000;
}

int64_t ahoraMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (int64_t)tv.tv_sec * 1000LL + tv.tv_usec / 1000;
}

// Lectura tomada antes de sincronizar la hora: se reconstruye con millis().
void corregirMarca(Lectura& l) {
  if (l.tsMs == 0 && horaSincronizada()) {
    l.tsMs = ahoraMs() - (int64_t)(uint32_t)(millis() - l.millisLocal);
  }
}

const char* motivoReinicio() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "encendido";
    case ESP_RST_BROWNOUT: return "caida_tension";
    case ESP_RST_SW:       return "software";
    case ESP_RST_PANIC:    return "error";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:      return "watchdog";
    case ESP_RST_EXT:      return "externo";
    default:               return "otro";
  }
}

unsigned long limitar(unsigned long x, unsigned long lo, unsigned long hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}
float limitarF(float x, float lo, float hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

// Buffer local en RAM y en flash (la flash se conserva tras un reinicio)
void quitarDeRam(size_t n) {
  if (n >= ramCantidad) { ramCantidad = 0; return; }
  memmove(bufRam, bufRam + n, (ramCantidad - n) * sizeof(Lectura));
  ramCantidad -= n;
}

size_t bytesEnFlash() {
  if (!flashOk || !LittleFS.exists(ARCHIVO_PENDIENTES)) return 0;
  File f = LittleFS.open(ARCHIVO_PENDIENTES, FILE_READ);
  if (!f) return 0;
  size_t t = f.size();
  f.close();
  return t;
}

size_t pendientesTotales() {
  size_t fl = bytesEnFlash();
  size_t enFlash = fl > offsetFlash ? (fl - offsetFlash) / sizeof(Lectura) : 0;
  return enFlash + ramCantidad;
}

// Pasa a flash las lecturas mas antiguas que ya tienen hora valida.
void volcarAFlash() {
  if (!flashOk) return;
  size_t n = 0;
  while (n < ramCantidad) {
    corregirMarca(bufRam[n]);
    if (bufRam[n].tsMs == 0) break;
    n++;
  }
  if (n == 0) return;

  File f = LittleFS.open(ARCHIVO_PENDIENTES, FILE_APPEND);
  if (!f) return;
  size_t tam = f.size();
  size_t caben = tam < MAX_FLASH_BYTES ? (MAX_FLASH_BYTES - tam) / sizeof(Lectura) : 0;
  size_t aEscribir = n < caben ? n : caben;
  if (aEscribir > 0) f.write((const uint8_t*)bufRam, aEscribir * sizeof(Lectura));
  f.close();

  descartadas += (n - aEscribir);   // flash llena: se descartan las mas recientes
  quitarDeRam(n);
}

void guardarPendiente(const Lectura& l) {
  if (ramCantidad >= CAP_RAM) {     // RAM llena: se descarta la lectura mas antigua
    quitarDeRam(1);
    descartadas++;
  }
  bufRam[ramCantidad++] = l;
  guardadas++;
  if (!mqtt.connected() && ramCantidad >= BLOQUE_FLASH) volcarAFlash();
}

// HTTP: configuracion y reenvio por lotes
bool obtenerConfig() {
  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  String url = baseHttp + "/api/nodes/" + NODO_ID + "/config";
  if (!http.begin(url)) return false;

  int codigo = http.GET();
  if (codigo != 200) {
    Serial.printf("[HTTP] Config no disponible (codigo %d); se mantienen valores\n", codigo);
    http.end();
    return false;
  }
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  if (err) {
    Serial.printf("[HTTP] Config con formato invalido: %s\n", err.c_str());
    return false;
  }

  cfg.muestreoMs       = limitar(doc["muestreo_ms"]        | cfg.muestreoMs,       1000, 60000);
  cfg.publicarActivoMs = limitar(doc["publicar_activo_ms"] | cfg.publicarActivoMs, 1000, 300000);
  cfg.muestrasParaReposo = (uint8_t)limitar(doc["muestras_para_reposo"] | (unsigned long)cfg.muestrasParaReposo, 1, 30);
  cfg.umbralCorrienteA = limitarF(doc["umbral_corriente_a"] | cfg.umbralCorrienteA, 0.0f, 5.0f);
  cfg.umbralVoltajePct = limitarF(doc["umbral_voltaje_pct"] | cfg.umbralVoltajePct, 0.5f, 50.0f);

  Serial.printf("[HTTP] Config: muestreo=%lums activo=%lums reposo_tras=%u muestras I_min=%.3fA dV=%.1f%%\n",
                cfg.muestreoMs, cfg.publicarActivoMs, cfg.muestrasParaReposo,
                cfg.umbralCorrienteA, cfg.umbralVoltajePct);
  return true;
}

ResultadoEnvio enviarLote(const Lectura* lote, size_t n) {
  static char cuerpo[96 + LOTE_HTTP * 64];
  int pos = snprintf(cuerpo, sizeof(cuerpo), "{\"nodo\":\"%s\",\"lecturas\":[", NODO_ID);
  for (size_t k = 0; k < n; k++) {
    pos += snprintf(cuerpo + pos, sizeof(cuerpo) - pos, "%s[%lld,%.1f,%.3f,%.1f]",
                    k ? "," : "", (long long)lote[k].tsMs, lote[k].v, lote[k].i, lote[k].p);
  }
  pos += snprintf(cuerpo + pos, sizeof(cuerpo) - pos, "]}");

  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(5000);
  String url = baseHttp + "/api/nodes/" + NODO_ID + "/backfill";
  if (!http.begin(url)) return ENVIO_REINTENTAR;
  http.addHeader("Content-Type", "application/json");
  int codigo = http.POST((uint8_t*)cuerpo, pos);
  http.end();

  if (codigo == 200) return ENVIO_OK;
  if (codigo >= 400 && codigo < 500) {
    // Lote rechazado por formato: no se reintenta.
    Serial.printf("[HTTP] Lote rechazado (codigo %d); se descarta\n", codigo);
    return ENVIO_DESCARTAR;
  }
  return ENVIO_REINTENTAR;
}

// Reenvia lo pendiente, primero la flash y luego la RAM; un lote por llamada.
void reenviarPendientes() {
  if (!mqtt.connected()) return;                 // sin broker se asume que el servidor no responde
  if (millis() - tUltimoReenvio < esperaReenvio) return;
  tUltimoReenvio = millis();
  esperaReenvio = 1000;

  static Lectura lote[LOTE_HTTP];

  size_t tam = bytesEnFlash();
  if (tam > 0) {
    if (offsetFlash >= tam) {
      LittleFS.remove(ARCHIVO_PENDIENTES);
      offsetFlash = 0;
      Serial.println("[BUFFER] Pendientes en flash reenviados por completo");
      return;
    }
    File f = LittleFS.open(ARCHIVO_PENDIENTES, FILE_READ);
    if (!f) return;
    f.seek(offsetFlash);
    size_t n = f.read((uint8_t*)lote, sizeof(lote)) / sizeof(Lectura);
    f.close();
    if (n == 0) { offsetFlash = tam; return; }  // registro incompleto

    ResultadoEnvio r = enviarLote(lote, n);
    if (r == ENVIO_REINTENTAR) { esperaReenvio = 10000; return; }
    if (r == ENVIO_DESCARTAR) descartadas += n;
    offsetFlash += n * sizeof(Lectura);
    return;
  }

  size_t n = 0;
  while (n < ramCantidad && n < LOTE_HTTP) {
    corregirMarca(bufRam[n]);
    if (bufRam[n].tsMs == 0) break;
    n++;
  }
  if (n == 0) return;
  ResultadoEnvio r = enviarLote(bufRam, n);
  if (r == ENVIO_REINTENTAR) { esperaReenvio = 10000; return; }
  if (r == ENVIO_DESCARTAR) descartadas += n;
  quitarDeRam(n);
}

// MQTT
void alRecibirMqtt(char* topico, byte* payload, unsigned int largo) {
  String msg;
  msg.reserve(largo);
  for (unsigned int k = 0; k < largo; k++) msg += (char)payload[k];
  msg.trim();
  if (msg == "recargar_config") {
    pedirConfig = true;   // se atiende en loop()
    Serial.println("[MQTT] Orden recibida: recargar configuracion");
  }
}

void publicarEstadoOnline() {
  char msg[220];
  snprintf(msg, sizeof(msg),
           "{\"estado\":\"online\",\"reset\":\"%s\",\"ip\":\"%s\",\"rssi\":%d,"
           "\"pendientes\":%u,\"descartadas\":%lu,\"uptime_s\":%lu}",
           primeraConexionMqtt ? motivoReinicio() : "reconexion",
           WiFi.localIP().toString().c_str(), WiFi.RSSI(),
           (unsigned)pendientesTotales(), descartadas, millis() / 1000);
  mqtt.publish(TOPICO_ESTADO.c_str(), msg, true);
  primeraConexionMqtt = false;
}

bool publicarTelemetria(Lectura l) {
  corregirMarca(l);
  char payload[128];
  uint32_t n = secuenciaMqtt + 1;
  if (l.tsMs > 0) {
    snprintf(payload, sizeof(payload), "{\"ts\":%lld,\"n\":%lu,\"v\":%.1f,\"i\":%.3f,\"p\":%.1f}",
             (long long)l.tsMs, (unsigned long)n, l.v, l.i, l.p);
  } else {
    snprintf(payload, sizeof(payload), "{\"n\":%lu,\"v\":%.1f,\"i\":%.3f,\"p\":%.1f}",
             (unsigned long)n, l.v, l.i, l.p);
  }
  bool ok = mqtt.publish(TOPICO_TELEMETRIA.c_str(), payload);
  if (ok) secuenciaMqtt = n;
  return ok;
}

// Estado de la carga (retenido): indica si el aparato esta apagado sin enviar lecturas en cero.
void publicarCarga() {
  if (!mqtt.connected()) return;
  char msg[80];
  if (tsCambioCarga > 0) {
    snprintf(msg, sizeof(msg), "{\"carga\":\"%s\",\"ts\":%lld}",
             cargaActiva ? "activa" : "reposo", (long long)tsCambioCarga);
  } else {
    snprintf(msg, sizeof(msg), "{\"carga\":\"%s\"}", cargaActiva ? "activa" : "reposo");
  }
  if (mqtt.publish(TOPICO_CARGA.c_str(), msg, true)) cargaPorPublicar = false;
}

void resolverServidor() {
  IPAddress ip = MDNS.queryHost(HOST_SERVIDOR_MDNS, 2000);
  if (ip.toString() != "0.0.0.0") {
    ipServidor = ip;
    Serial.printf("[RED] Servidor encontrado por mDNS: %s\n", ip.toString().c_str());
  } else {
    ipServidor.fromString(IP_SERVIDOR_RESPALDO);
    Serial.printf("[RED] mDNS sin respuesta; IP de respaldo %s\n", IP_SERVIDOR_RESPALDO);
  }
  baseHttp = String("http://") + ipServidor.toString() + ":" + String(PUERTO_HTTP);
  mqtt.setServer(ipServidor, PUERTO_MQTT);

  // La Raspberry es tambien el servidor de hora (chrony).
  strlcpy(ntpServidor, ipServidor.toString().c_str(), sizeof(ntpServidor));
  configTime(0, 0, ntpServidor, "pool.ntp.org");
}

void gestionarMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) { mqtt.loop(); return; }
  if (millis() - tIntentoMqtt < esperaMqtt) return;
  tIntentoMqtt = millis();

  String clientId = String("esp32-") + NODO_ID;
  const char* testamento = "{\"estado\":\"offline\"}";   // mensaje de testamento (LWT)
  if (mqtt.connect(clientId.c_str(), nullptr, nullptr,
                   TOPICO_ESTADO.c_str(), 1, true, testamento)) {
    fallosMqtt = 0;
    esperaMqtt = 2000;
    mqtt.subscribe(TOPICO_CMD.c_str(), 1);
    publicarEstadoOnline();
    cargaPorPublicar = true;
    Serial.println("[MQTT] Conectado al broker");
  } else {
    fallosMqtt++;
    esperaMqtt = esperaMqtt == 0 ? 2000 : esperaMqtt * 2;
    if (esperaMqtt > 60000UL) esperaMqtt = 60000UL;
    Serial.printf("[MQTT] Fallo de conexion (estado %d); reintento en %lu s\n",
                  mqtt.state(), esperaMqtt / 1000);
    if (fallosMqtt % 3 == 0) resolverServidor();   // vuelve a resolver la IP del servidor
  }
}

// WiFi
void alConectarWiFi() {
  Serial.printf("[WiFi] Conectado a %s  IP %s  RSSI %d dBm\n",
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  if (!mdnsIniciado) {
    String nombre = String("esp32-") + NODO_ID;
    nombre.replace("_", "-");
    mdnsIniciado = MDNS.begin(nombre.c_str());
  }
  resolverServidor();
  pedirConfig  = true;
  esperaMqtt   = 0;
  tIntentoMqtt = 0;
}

void gestionarWiFi() {
  bool conectado = WiFi.status() == WL_CONNECTED;
  if (conectado && !wifiEstabaConectado) alConectarWiFi();
  if (!conectado && wifiEstabaConectado)
    Serial.println("[WiFi] Conexion perdida; las lecturas se guardan localmente");
  wifiEstabaConectado = conectado;

  // Cada 20 s sin conexion se prueban todas las redes registradas.
  if (!conectado && millis() - tIntentoWifi >= 20000) {
    tIntentoWifi = millis();
    wifiMulti.run(5000);
  }
}

void gestionarConfig() {
  if (WiFi.status() != WL_CONNECTED) return;
  bool reintento = !configObtenida && (millis() - tIntentoConfig >= 60000);
  if (!pedirConfig && !reintento) return;
  pedirConfig = false;
  tIntentoConfig = millis();
  if (obtenerConfig()) configObtenida = true;
}

// Muestreo y publicacion por excepcion
void despachar(const Lectura& l) {
  if (mqtt.connected() && publicarTelemetria(l)) enviadasMqtt++;
  else guardarPendiente(l);
}

void cambiarCarga(bool activa) {
  cargaActiva = activa;
  tsCambioCarga = horaSincronizada() ? ahoraMs() : 0;
  cargaPorPublicar = true;
  Serial.printf("[CARGA] %s\n", activa ? "Aparato encendido: se envian lecturas"
                                       : "Sin carga: se suspende el envio");
}

void tareaMuestreo() {
  unsigned long ahora = millis();
  if (ahora - tUltimaMuestra < cfg.muestreoMs) return;
  tUltimaMuestra = ahora;

  // La libreria lee los registros del PZEM en una sola transaccion Modbus.
  float v = pzem.voltage();
  float i = pzem.current();
  float p = pzem.power();
  if (isnan(v) || isnan(i) || isnan(p)) {
    erroresSensor++;
    if (erroresSensor % 10 == 1) Serial.println("[PZEM] Sin respuesta del sensor");
    return;
  }

  // El encendido es inmediato; el reposo exige varias muestras seguidas bajo el umbral.
  if (i >= cfg.umbralCorrienteA) {
    muestrasBajoUmbral = 0;
    if (!cargaActiva) { cambiarCarga(true); hayPublicacion = false; }
  } else if (cargaActiva) {
    if (++muestrasBajoUmbral >= cfg.muestrasParaReposo) cambiarCarga(false);
  }
  if (cargaPorPublicar) publicarCarga();

  if (!cargaActiva) return;
  if (i < cfg.umbralCorrienteA) return;

  Lectura l;
  l.tsMs = horaSincronizada() ? ahoraMs() : 0;
  l.millisLocal = ahora;
  l.v = v; l.i = i; l.p = p;

  unsigned long tolerancia = cfg.muestreoMs / 2;
  bool porTiempo    = (ahora - tUltimaPublicacion + tolerancia) >= cfg.publicarActivoMs;
  bool saltoVoltaje = hayPublicacion && ultimoVPublicado > 0 &&
                      fabsf(v - ultimoVPublicado) * 100.0f / ultimoVPublicado >= cfg.umbralVoltajePct;

  if (!hayPublicacion || porTiempo || saltoVoltaje) {
    despachar(l);
    tUltimaPublicacion = ahora;
    ultimoVPublicado   = v;
    hayPublicacion     = true;
  }
}

void imprimirResumen() {
  static unsigned long t = 0;
  if (millis() - t < 60000) return;
  t = millis();
  Serial.printf("[RESUMEN] carga=%s WiFi=%s MQTT=%s hora=%s enviadas=%lu pendientes=%u "
                "descartadas=%lu errores_pzem=%lu heap=%u\n",
                cargaActiva ? "activa" : "reposo",
                WiFi.status() == WL_CONNECTED ? "si" : "no",
                mqtt.connected() ? "si" : "no",
                horaSincronizada() ? "si" : "no",
                enviadasMqtt, (unsigned)pendientesTotales(), descartadas,
                erroresSensor, (unsigned)ESP.getFreeHeap());
}

// setup / loop
void setup() {
  Serial.begin(115200);
  delay(200);
  setCpuFrequencyMhz(80);

  Serial.printf("\n[INICIO] %s  motivo de reinicio: %s\n", NODO_ID, motivoReinicio());

  flashOk = LittleFS.begin(true);
  if (flashOk) {
    Serial.printf("[BUFFER] Lecturas pendientes en flash: %u\n",
                  (unsigned)(bytesEnFlash() / sizeof(Lectura)));
  } else {
    Serial.println("[BUFFER] LittleFS no disponible; solo se usara RAM");
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(true);
  WiFi.setAutoReconnect(true);
  registrarRedesWiFi(wifiMulti);

  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(15);
  mqtt.setSocketTimeout(3);
  mqtt.setCallback(alRecibirMqtt);

  ipServidor.fromString(IP_SERVIDOR_RESPALDO);
  baseHttp = String("http://") + IP_SERVIDOR_RESPALDO + ":" + String(PUERTO_HTTP);

  Serial.println("[WiFi] Conectando...");
  wifiMulti.run(10000);
  tIntentoWifi = millis();
}

void loop() {
  gestionarWiFi();
  gestionarMQTT();
  gestionarConfig();
  tareaMuestreo();
  reenviarPendientes();
  imprimirResumen();
  delay(10);
}
