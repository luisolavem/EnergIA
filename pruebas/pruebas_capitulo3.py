"""
Mediciones del Capítulo 3: resiliencia, latencia, pérdida de mensajes, alertas y
evaluación semanal en operación.

Se ejecuta en la Raspberry, desde la carpeta del backend:
  python pruebas_capitulo3.py ayuda       lista de comandos

Cada comando guarda su salida en resultados/<comando>_<fecha-hora>.txt. Solo lee
datos; la prueba de carga escribe puntos de prueba y los borra al terminar.
"""

import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ZONA = timezone(timedelta(hours=-5))
APARATOS = {"nodo_1": "Nevera1", "nodo_2": "Nevera2", "nodo_3": "Router", "nodo_4": "PC", "nodo_5": "TVyDeco"}


def cargar_env():
    ruta = Path(__file__).with_name(".env")
    if ruta.exists():
        for linea in ruta.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def influx():
    from influxdb_client import InfluxDBClient
    cargar_env()
    c = InfluxDBClient(url=os.getenv("INFLUX_URL", "http://localhost:8086"), token=os.getenv("INFLUX_TOKEN", ""),
                       org=os.getenv("INFLUX_ORG", "EnergIA"), timeout=120_000)
    return c, os.getenv("INFLUX_ORG", "EnergIA"), os.getenv("INFLUX_BUCKET", "datos_consumo_energetico")


def utc(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local(texto: str) -> datetime:
    return datetime.strptime(texto, "%Y-%m-%d %H:%M").replace(tzinfo=ZONA)


def percentil(valores, p):
    v = sorted(valores)
    if not v:
        return float("nan")
    k = (len(v) - 1) * p / 100
    i = int(k)
    return v[i] if i + 1 >= len(v) else v[i] + (v[i + 1] - v[i]) * (k - i)


def tabla(filas, columnas):
    if not filas:
        print("  (sin datos)")
        return
    anchos = [max(len(str(c)), *(len(str(f.get(c, ""))) for f in filas)) for c in columnas]
    print("  ".join(str(c).ljust(a) for c, a in zip(columnas, anchos)))
    print("  ".join("-" * a for a in anchos))
    for f in filas:
        print("  ".join(str(f.get(c, "")).ljust(a) for c, a in zip(columnas, anchos)))


# Latencia
# Límites de los intervalos del histograma (ms): 5 ms hasta 1 s, 50 ms hasta 5 s, 1 s hasta 60 s
LIMITES_LAT = ([float(x) for x in range(5, 1001, 5)] + [float(x) for x in range(1050, 5001, 50)]
               + [float(x) for x in range(6000, 60001, 1000)])


def percentil_histograma(acum, p):
    """acum: lista ordenada de (limite_superior, conteo_acumulado). Interpola dentro del intervalo."""
    total = acum[-1][1]
    objetivo = total * p / 100
    previo_lim, previo_n = 0.0, 0
    for lim, n in acum:
        if n >= objetivo:
            if n == previo_n or lim == float("inf"):
                return previo_lim if lim == float("inf") else lim
            return previo_lim + (lim - previo_lim) * (objetivo - previo_n) / (n - previo_n)
        previo_lim, previo_n = lim, n
    return acum[-1][0]


def cmd_latencia_influx(a):
    """Percentiles por nodo a partir de histogramas diarios calculados en InfluxDB,
    para no cargar millones de puntos en memoria."""
    c, org, bucket = influx()
    q = c.query_api()
    fin = datetime.now(ZONA)
    inicio = fin - timedelta(days=a.dias)
    bins = "[" + ", ".join(f"{x:.1f}" for x in LIMITES_LAT) + "]"
    hist, maximo = {}, {}
    dia = inicio
    while dia < fin:
        hasta = min(dia + timedelta(days=1), fin)
        base = f'''
from(bucket: "{bucket}")
  |> range(start: {utc(dia)}, stop: {utc(hasta)})
  |> filter(fn: (r) => r._measurement == "latencia" and r._field == "latencia_ms")
  |> map(fn: (r) => ({{r with _value: float(v: r._value)}}))
  |> group(columns: ["nodo"])
'''
        try:
            for t in q.query(base + f"  |> histogram(bins: {bins})", org=org):
                for r in t.records:
                    nodo = r.values.get("nodo")
                    h = hist.setdefault(nodo, {})
                    le = float(r.values.get("le"))
                    h[le] = h.get(le, 0) + int(r.get_value())
            for t in q.query(base + "  |> max()", org=org):
                for r in t.records:
                    nodo = r.values.get("nodo")
                    maximo[nodo] = max(maximo.get(nodo, 0), r.get_value())
        except Exception as e:
            print(f"  {dia:%d-%b}: no se pudo consultar ({type(e).__name__}); se omite ese día")
            time.sleep(5)
        else:
            print(f"  {dia:%d-%b} listo", flush=True)
        dia = hasta
    c.close()
    if not hist:
        print("No hay lecturas de latencia en ese periodo.")
        return
    # Cada histograma de Flux es acumulado; el último límite (60 s) cubre todo, porque el backend
    # no asigna latencia a lecturas de más de 60 s (las trata como reenvío)
    filas, total_h = [], {}
    for nodo in sorted(hist):
        acum = sorted(hist[nodo].items())
        for lim, n in acum:
            total_h[lim] = total_h.get(lim, 0) + n
        filas.append((f"{nodo} ({APARATOS.get(nodo, '')})", acum, maximo.get(nodo, 0)))
    filas.append(("TODOS", sorted(total_h.items()), max(maximo.values()) if maximo else 0))
    print(f"\nLatencia de extremo a extremo (nodo -> backend) · InfluxDB, {inicio:%d-%b %H:%M} a {fin:%d-%b %H:%M}\n")
    salida = []
    for nombre, acum, mx in filas:
        n = acum[-1][1]
        dentro = next((v for lim, v in acum if lim >= 2000), n)
        salida.append({"nodo": nombre, "lecturas": f"{n:,}".replace(",", "."),
                       "mediana_ms": round(percentil_histograma(acum, 50)),
                       "P95_ms": round(percentil_histograma(acum, 95)),
                       "P99_ms": round(percentil_histograma(acum, 99)), "max_ms": round(mx),
                       "<=2s_%": round(100 * dentro / max(1, n), 2)})
    tabla(salida, ["nodo", "lecturas", "mediana_ms", "P95_ms", "P99_ms", "max_ms", "<=2s_%"])
    print("\nPercentiles con resolución de 5 ms hasta 1 s y 50 ms hasta 5 s."
          "\nSolo tienen latencia las lecturas en tiempo real con hora del nodo confiable (no el reenvío).")


def cmd_latencia(a):
    if a.csv:
        import pandas as pd
        df = pd.read_csv(a.csv)
        col = "latencia_ms" if "latencia_ms" in df.columns else df.columns[-1]
        grupos = {n: g[col].dropna().tolist() for n, g in df.groupby("nodo")}
        origen = a.csv
    else:
        cmd_latencia_influx(a)
        return
    filas, todas = [], []
    for n in sorted(grupos):
        v = grupos[n]
        todas += v
        filas.append({"nodo": f"{n} ({APARATOS.get(n, '')})", "lecturas": f"{len(v):,}".replace(",", "."),
                      "mediana_ms": round(statistics.median(v)), "P95_ms": round(percentil(v, 95)),
                      "P99_ms": round(percentil(v, 99)), "max_ms": round(max(v))})
    if todas:
        filas.append({"nodo": "TODOS", "lecturas": f"{len(todas):,}".replace(",", "."),
                      "mediana_ms": round(statistics.median(todas)), "P95_ms": round(percentil(todas, 95)),
                      "P99_ms": round(percentil(todas, 99)), "max_ms": round(max(todas))})
    print(f"\nLatencia de extremo a extremo (nodo -> backend) · {origen}\n")
    tabla(filas, ["nodo", "lecturas", "mediana_ms", "P95_ms", "P99_ms", "max_ms"])
    print("\nNota: solo tienen latencia las lecturas en tiempo real con hora del nodo confiable (no el reenvío).")


# Pérdidas MQTT
def cmd_perdidas(a):
    """Pérdida de mensajes MQTT en tránsito: saltos en la secuencia n de cada nodo.
    Un salto se cuenta como pérdida en tránsito solo si el nodo no se desconectó en medio (estado offline)
    y si faltan como máximo --max-salto mensajes seguidos; los saltos mayores son desconexiones,
    que se evalúan en la sección de resiliencia y no en esta prueba."""
    import paho.mqtt.client as mqtt
    cargar_env()
    prefijo = os.getenv("MQTT_PREFIJO", "energia")
    estado = {}

    def nodo_de(topico):
        return topico.split("/")[1]

    def s_de(nodo):
        return estado.setdefault(nodo, {"recibidos": 0, "perdidos": 0, "saltos": 0, "en_desconexion": 0,
                                        "desconexiones": 0, "ultimo": None, "reinicios": 0, "caido": False})

    def al_mensaje(_c, _u, msg):
        nodo = nodo_de(msg.topic)
        if msg.topic.endswith("/estado"):
            try:
                txt = msg.payload.decode(errors="ignore")
                est = json.loads(txt).get("estado", txt) if txt.strip().startswith("{") else txt
            except Exception:
                return
            if "offline" in str(est) and not msg.retain:
                s = s_de(nodo); s["caido"] = True; s["desconexiones"] += 1
            return
        try:
            n = json.loads(msg.payload).get("n")
        except Exception:
            return
        if n is None:
            return
        s = s_de(nodo)
        s["recibidos"] += 1
        if s["ultimo"] is not None:
            faltan = n - s["ultimo"] - 1
            if n <= s["ultimo"]:
                s["reinicios"] += 1      # el nodo se reinició y la secuencia volvió a empezar
            elif faltan > 0:
                if s["caido"] or faltan > a.max_salto:
                    s["en_desconexion"] += faltan
                else:
                    s["perdidos"] += faltan; s["saltos"] += 1
        s["ultimo"] = n
        s["caido"] = False

    c = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=f"prueba-perdidas-{os.getpid()}")
    c.on_message = al_mensaje
    c.connect(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1883")), 30)
    c.subscribe([(f"{prefijo}/+/telemetria", 0), (f"{prefijo}/+/estado", 1)])
    c.loop_start()
    inicio = datetime.now(ZONA)
    print(f"Escuchando la telemetría {a.minutos:g} minutos desde {inicio:%H:%M} (Ctrl+C para terminar antes)...")
    try:
        time.sleep(a.minutos * 60)
    except KeyboardInterrupt:
        pass
    c.loop_stop(); c.disconnect()
    fin = datetime.now(ZONA)
    filas, R, P, D = [], 0, 0, 0
    for n in sorted(estado):
        s = estado[n]
        if not s["recibidos"]:
            continue
        R += s["recibidos"]; P += s["perdidos"]; D += s["en_desconexion"]
        filas.append({"nodo": f"{n} ({APARATOS.get(n, '')})", "recibidos": s["recibidos"],
                      "perdidos_transito": s["perdidos"], "saltos": s["saltos"],
                      "perdida_%": round(100 * s["perdidos"] / max(1, s["recibidos"] + s["perdidos"]), 3),
                      "desconexiones": s["desconexiones"], "msj_en_desconexion": s["en_desconexion"],
                      "reinicios": s["reinicios"]})
    filas.append({"nodo": "TODOS", "recibidos": R, "perdidos_transito": P, "saltos": "",
                  "perdida_%": round(100 * P / max(1, R + P), 3), "desconexiones": "",
                  "msj_en_desconexion": D, "reinicios": ""})
    print(f"\nPérdida de mensajes MQTT en tránsito · {inicio:%d-%b %H:%M} a {fin:%H:%M}\n")
    tabla(filas, ["nodo", "recibidos", "perdidos_transito", "saltos", "perdida_%", "desconexiones",
                  "msj_en_desconexion", "reinicios"])
    print(f"\nPérdida en tránsito: saltos de hasta {a.max_salto} mensajes sin desconexión del nodo. Los mensajes"
          "\nde una desconexión (msj_en_desconexion) no cuentan aquí: se evalúan en la resiliencia (caidas)."
          "\nUn nodo con el aparato en reposo no publica telemetría y no aparece.")


# Resiliencia
def cmd_resiliencia(a):
    c, org, bucket = influx()
    ini, fin = local(a.desde), local(a.hasta)
    flux = f'''
from(bucket: "{bucket}")
  |> range(start: {utc(ini)}, stop: {utc(fin)})
  |> filter(fn: (r) => r._measurement == "consumo_electrico" and r._field == "potencia")
  |> keep(columns: ["_time", "nodo"])
'''
    tiempos = {}
    for t in c.query_api().query(flux, org=org):
        for r in t.records:
            tiempos.setdefault(r.values.get("nodo"), []).append(r.get_time())
    c.close()
    dur = (fin - ini).total_seconds()
    filas, total = [], 0
    for n in sorted(APARATOS):
        ts = sorted(tiempos.get(n, []))
        total += len(ts)
        marcas = [ini.astimezone(timezone.utc)] + ts + [fin.astimezone(timezone.utc)]
        hueco = max((b - a_).total_seconds() for a_, b in zip(marcas, marcas[1:]))
        filas.append({"nodo": f"{n} ({APARATOS[n]})", "lecturas": len(ts), "esperadas_si_activo": int(dur / 2),
                      "cobertura_%": round(100 * len(ts) / max(1, dur / 2), 1), "mayor_hueco_s": round(hueco, 1)})
    print(f"\nLecturas guardadas entre {ini:%d-%b %H:%M} y {fin:%H:%M} ({dur / 60:.0f} min)\n")
    tabla(filas, ["nodo", "lecturas", "esperadas_si_activo", "cobertura_%", "mayor_hueco_s"])
    print(f"\nTotal de lecturas en la ventana: {total}")
    print("Un nodo con el aparato en reposo no genera lecturas: su 'cobertura' baja sin que haya pérdida.")


# Caídas reales ya registradas
def cmd_caidas(a):
    c, org, bucket = influx()
    q = c.query_api()
    fin = datetime.now(ZONA)
    inicio = fin - timedelta(days=a.dias)

    def consulta(flux):
        return [r for t in q.query(flux, org=org) for r in t.records]

    estados = consulta(f'''
from(bucket: "{bucket}")
  |> range(start: {utc(inicio)}, stop: {utc(fin)})
  |> filter(fn: (r) => r._measurement == "estado_nodo")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "nodo", "estado", "reset"])
''')
    eventos = consulta(f'''
from(bucket: "{bucket}")
  |> range(start: {utc(inicio)}, stop: {utc(fin)})
  |> filter(fn: (r) => r._measurement == "eventos" and r._field == "descripcion")
  |> keep(columns: ["_time", "tipo"])
''')
    cortes = sorted({r.get_time() for r in eventos if r.values.get("tipo") == "posible_corte_energia"})
    reinicios = sorted({r.get_time() for r in eventos if r.values.get("tipo") == "inicio_backend"})

    # Intervalos offline -> online por nodo
    por_nodo = {}
    for r in estados:
        por_nodo.setdefault(r.values.get("nodo"), []).append(
            (r.get_time(), str(r.values.get("estado")), str(r.values.get("reset") or "")))
    intervalos = []
    for nodo, lista in por_nodo.items():
        lista.sort()
        caida = None
        for t, est, reset in lista:
            if est == "offline" and caida is None:
                caida = t
            elif est == "online" and caida is not None:
                intervalos.append((nodo, caida, t, reset))
                caida = None
    intervalos = [i for i in intervalos if (i[2] - i[1]).total_seconds() >= a.min_minutos * 60]
    intervalos.sort(key=lambda x: x[1])

    filas = []
    for nodo, ini, fin_i, reset in intervalos:
        dur = (fin_i - ini).total_seconds()
        ts = sorted(r.get_time() for r in consulta(f'''
from(bucket: "{bucket}")
  |> range(start: {utc(ini)}, stop: {utc(fin_i)})
  |> filter(fn: (r) => r._measurement == "consumo_electrico" and r._field == "potencia" and r.nodo == "{nodo}")
  |> keep(columns: ["_time"])
'''))
        marcas = [ini] + ts + [fin_i]
        hueco = max((b - a_).total_seconds() for a_, b in zip(marcas, marcas[1:]))
        corte = any(ini - timedelta(minutes=2) <= m <= fin_i for m in cortes) or reset == "encendido"
        # Si el backend se reinició durante la caída, la reconexión pudo no quedar registrada:
        # la duración de ese intervalo no es confiable.
        dudosa = any(ini <= m <= fin_i for m in reinicios)
        esperadas = int(dur / 2)
        filas.append({"nodo": nodo, "aparato": APARATOS.get(nodo, ""),
                      "inicio": ini.astimezone(ZONA).strftime("%Y-%m-%d %H:%M"),
                      "fin": fin_i.astimezone(ZONA).strftime("%Y-%m-%d %H:%M"),
                      "duracion_min": round(dur / 60, 1),
                      "causa": "corte_de_luz" if corte else "red_wifi",
                      "reconexion": reset or "",
                      "lecturas_recuperadas": len(ts), "esperadas_si_activo": esperadas,
                      "recuperado_pct": round(100 * len(ts) / max(1, esperadas), 1),
                      "mayor_hueco_min": round(hueco / 60, 1),
                      "backend_reiniciado": "si" if dudosa else "no"})
    c.close()
    if not filas:
        print("No hay desconexiones registradas en ese periodo.")
        return

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(filas[0]))
            w.writeheader(); w.writerows(filas)
        print(f"Detalle de las {len(filas)} desconexiones guardado en {a.csv}")
    if a.detalle:
        tabla(filas, ["nodo", "inicio", "duracion_min", "causa", "reconexion", "lecturas_recuperadas",
                      "esperadas_si_activo", "mayor_hueco_min", "backend_reiniciado"])

    confiables = [f for f in filas if f["backend_reiniciado"] == "no"]
    print(f"\nDesconexiones de {a.min_minutos:.0f} min o más · {inicio:%d-%b} a {fin:%d-%b %H:%M}")
    print(f"Total {len(filas)}; {len(filas) - len(confiables)} con un reinicio del backend en medio "
          f"(duración no confiable, se excluyen del resumen).\n")

    def resumen(grupo):
        dur = [f["duracion_min"] for f in grupo]
        rec = [f for f in grupo if f["causa"] == "red_wifi"]
        return {"desconexiones": len(grupo), "horas": round(sum(dur) / 60, 1),
                "mediana_min": round(statistics.median(dur), 1), "max_h": round(max(dur) / 60, 1),
                "cortes_luz": sum(f["causa"] == "corte_de_luz" for f in grupo),
                "lecturas_recuperadas": sum(f["lecturas_recuperadas"] for f in rec)}

    print("Por nodo:")
    filas_n = []
    for nodo in sorted(APARATOS):
        g = [f for f in confiables if f["nodo"] == nodo]
        if g:
            filas_n.append({"nodo": f"{nodo} ({APARATOS[nodo]})", **resumen(g)})
    if confiables:
        filas_n.append({"nodo": "TODOS", **resumen(confiables)})
    tabla(filas_n, ["nodo", "desconexiones", "horas", "mediana_min", "max_h", "cortes_luz", "lecturas_recuperadas"])

    print("\nPor duración (solo red/Wi-Fi; recuperación medida en Router y TV, que siempre están encendidos):")
    tramos = [("< 5 min", 0, 5), ("5-30 min", 5, 30), ("30 min-2 h", 30, 120), ("2-24 h", 120, 1440),
              ("> 24 h", 1440, 1e9)]
    filas_d = []
    for nombre, lo, hi in tramos:
        g = [f for f in confiables if f["causa"] == "red_wifi" and lo <= f["duracion_min"] < hi]
        siempre = [f for f in g if f["nodo"] in ("nodo_3", "nodo_5")]
        filas_d.append({"duracion": nombre, "desconexiones": len(g),
                        "recuperado_mediana_%": round(statistics.median([f["recuperado_pct"] for f in siempre]), 1) if siempre else "-",
                        "con_recuperacion_>=90%": sum(f["recuperado_pct"] >= 90 for f in siempre) if siempre else "-",
                        "casos_router_tv": len(siempre)})
    tabla(filas_d, ["duracion", "desconexiones", "casos_router_tv", "recuperado_mediana_%", "con_recuperacion_>=90%"])

    print("\nMotivo de la reconexión:")
    motivos = {}
    for f in confiables:
        motivos[f["reconexion"] or "(sin dato)"] = motivos.get(f["reconexion"] or "(sin dato)", 0) + 1
    tabla([{"motivo": k, "veces": v} for k, v in sorted(motivos.items(), key=lambda x: -x[1])], ["motivo", "veces"])
    print("\nLas lecturas dentro de una desconexión solo pudieron llegar por el reenvío (backfill) del nodo.")


# Alertas de la IA
def cmd_alertas(a):
    """Lista las alertas del detector (anomalia_ia) y las exporta a CSV para revisarlas."""
    c, org, bucket = influx()
    q = c.query_api()
    fin = datetime.now(ZONA)
    inicio = fin - timedelta(days=a.dias)
    alertas = [r.values for t in q.query(f'''
from(bucket: "{bucket}")
  |> range(start: {utc(inicio)}, stop: {utc(fin)})
  |> filter(fn: (r) => r._measurement == "anomalia_ia")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
''', org=org) for r in t.records]
    estados = [r for t in q.query(f'''
from(bucket: "{bucket}")
  |> range(start: {utc(inicio - timedelta(days=1))}, stop: {utc(fin)})
  |> filter(fn: (r) => r._measurement == "estado_nodo" and r._field == "estado")
  |> keep(columns: ["_time", "nodo", "_value"])
''', org=org) for r in t.records]
    c.close()
    if not alertas:
        print("No hay alertas de la IA en ese periodo.")
        return
    # Intervalos en que cada nodo estuvo desconectado
    caidas, abierta = {}, {}
    for r in sorted(estados, key=lambda r: r.get_time()):
        nodo, est, t = r.values.get("nodo"), str(r.get_value()), r.get_time()
        if est == "offline" and nodo not in abierta:
            abierta[nodo] = t
        elif est == "online" and nodo in abierta:
            caidas.setdefault(nodo, []).append((abierta.pop(nodo), t))
    for nodo, t in abierta.items():
        caidas.setdefault(nodo, []).append((t, datetime.now(timezone.utc)))

    def min_caido(nodo, ini, fin_h):
        s = 0.0
        for x, y in caidas.get(nodo, []):
            s += max(0.0, (min(y, fin_h) - max(x, ini)).total_seconds())
        return round(s / 60)

    filas = []
    for v in sorted(alertas, key=lambda v: v["_time"]):
        ini = v["_time"]
        nk = v.get("normal_kwh")
        filas.append({"hora": ini.astimezone(ZONA).strftime("%Y-%m-%d %H:%M"), "aparato": v.get("aparato", ""),
                      "tipo": v.get("tipo", ""), "wh": round(1000 * float(v.get("kwh") or 0)),
                      "normal_wh": "" if nk is None or nk < 0 else round(1000 * float(nk)),
                      "min_nodo_desconectado": min_caido(v.get("nodo"), ini, ini + timedelta(hours=1)),
                      "descripcion": v.get("descripcion", ""), "real": "", "que_paso": ""})
    print(f"\nAlertas de la IA · {inicio:%d-%b} a {fin:%d-%b %H:%M} · {len(filas)} alertas\n")
    tabla(filas, ["hora", "aparato", "tipo", "wh", "normal_wh", "min_nodo_desconectado"])
    resumen = {}
    for f in filas:
        resumen[(f["aparato"], f["tipo"])] = resumen.get((f["aparato"], f["tipo"]), 0) + 1
    print("\nPor aparato y tipo:")
    tabla([{"aparato": k[0], "tipo": k[1], "alertas": n} for k, n in sorted(resumen.items())],
          ["aparato", "tipo", "alertas"])
    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(filas[0]))
            w.writeheader(); w.writerows(filas)
        print(f"\nDetalle guardado en {a.csv}. Llena la columna real (si / no / no_se) y que_paso.")


# Carga del servidor
def cpu_tiempos():
    v = list(map(int, open("/proc/stat").readline().split()[1:]))
    return sum(v), v[3] + v[4]


def mem_disponible_mb():
    for linea in open("/proc/meminfo"):
        if linea.startswith("MemAvailable"):
            return int(linea.split()[1]) / 1024
    return float("nan")


def mem_total_mb():
    for linea in open("/proc/meminfo"):
        if linea.startswith("MemTotal"):
            return int(linea.split()[1]) / 1024
    return float("nan")


def temperatura():
    try:
        return int(open("/sys/class/thermal/thermal_zone0/temp").read()) / 1000
    except Exception:
        return float("nan")


def cmd_carga(a):
    from influxdb_client import Point, WritePrecision
    from influxdb_client.client.write_api import SYNCHRONOUS
    c, org, bucket = influx()
    w = c.write_api(write_options=SYNCHRONOUS)
    cpu, ram, temp, esc = [], [], [], []
    inicio = datetime.now(ZONA)
    fin = time.time() + a.minutos * 60
    total_prev, ocio_prev = cpu_tiempos()
    print(f"Midiendo {a.minutos} minutos desde {inicio:%H:%M} con el sistema en operación normal...")
    try:
        while time.time() < fin:
            time.sleep(5)
            total, ocio = cpu_tiempos()
            cpu.append(100 * (1 - (ocio - ocio_prev) / max(1, total - total_prev)))
            total_prev, ocio_prev = total, ocio
            ram.append(mem_disponible_mb())
            temp.append(temperatura())
            t0 = time.perf_counter()
            w.write(bucket=bucket, org=org, record=Point("prueba_carga").field("v", 1.0).time(
                datetime.now(timezone.utc), WritePrecision.MS))
            esc.append(1000 * (time.perf_counter() - t0))
    except KeyboardInterrupt:
        pass
    # Se borran los puntos de prueba
    try:
        c.delete_api().delete(utc(inicio - timedelta(minutes=1)), utc(datetime.now(ZONA) + timedelta(minutes=1)),
                              '_measurement="prueba_carga"', bucket=bucket, org=org)
    except Exception as e:
        print("No se pudieron borrar los puntos de prueba (no afecta nada):", e)
    c.close()
    print(f"\nCarga del servidor · {len(cpu)} muestras cada 5 s · RAM total {mem_total_mb():.0f} MB\n")
    tabla([
        {"medida": "CPU usada (%)", "promedio": round(statistics.mean(cpu), 1), "P95": round(percentil(cpu, 95), 1), "max": round(max(cpu), 1)},
        {"medida": "RAM disponible (MB)", "promedio": round(statistics.mean(ram)), "P95": "", "max": f"min {min(ram):.0f}"},
        {"medida": "Temperatura (°C)", "promedio": round(statistics.mean(temp), 1), "P95": round(percentil(temp, 95), 1), "max": round(max(temp), 1)},
        {"medida": "Escritura InfluxDB (ms)", "promedio": round(statistics.mean(esc), 1),
         "P95": round(percentil(esc, 95), 1), "max": f"P99 {percentil(esc, 99):.1f} · max {max(esc):.1f}"},
    ], ["medida", "promedio", "P95", "max"])


# Evaluación semanal en operación
def cmd_semanal(a):
    """Semanas ya evaluadas por el backend: predicción de 7 días frente a lo medido."""
    c, org, bucket = influx()
    filas = [r.values for t in c.query_api().query(f'''
from(bucket: "{bucket}")
  |> range(start: -{int(a.dias)}d)
  |> filter(fn: (r) => r._measurement == "evaluacion_semana")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
''', org=org) for r in t.records]
    c.close()
    if not filas:
        print("Todavía no hay semanas evaluadas (el backend evalúa una semana 7 días después de predecirla).")
        return
    salida = []
    for v in sorted(filas, key=lambda v: v["_time"]):
        f = {"semana_desde": v["_time"].astimezone(ZONA).strftime("%Y-%m-%d"),
             "real_kwh": v.get("real_kwh"), "predicho_kwh": v.get("predicho_kwh"),
             "error_semana_%": v.get("error_pct"), "MAE_Wh": v.get("mae_wh")}
        for d in range(1, 8):
            f[f"d{d}_%"] = v.get(f"error_d{d}", "")
        salida.append(f)
    print(f"\nEvaluación semanal en operación · {len(salida)} semanas\n")
    tabla(salida, list(salida[0]))
    errs = [f["error_semana_%"] for f in salida if f["error_semana_%"] is not None]
    if errs:
        print(f"\nError semanal medio: {statistics.mean(errs):.2f} % · criterio MAPE <= 10 %")


# Exactitud de la medición
def cmd_medir(a):
    """Muestra en vivo las lecturas de un nodo."""
    import paho.mqtt.client as mqtt
    cargar_env()
    prefijo = os.getenv("MQTT_PREFIJO", "energia")
    vistas = []

    def al_mensaje(_c, _u, msg):
        try:
            d = json.loads(msg.payload)
        except Exception:
            return
        vistas.append(d)
        print(f"{datetime.now(ZONA):%H:%M:%S}  V = {d.get('v', '-'):>7}  I = {d.get('i', '-'):>7}  P = {d.get('p', '-'):>8}",
              flush=True)

    c = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=f"prueba-medir-{os.getpid()}")
    c.on_message = al_mensaje
    c.connect(os.getenv("MQTT_HOST", "localhost"), int(os.getenv("MQTT_PORT", "1883")), 30)
    c.subscribe(f"{prefijo}/{a.nodo}/telemetria", qos=0)
    c.loop_start()
    print(f"Lecturas de {a.nodo} ({APARATOS.get(a.nodo, '')}); se detiene sola tras {a.n} lecturas (Ctrl+C antes).")
    print("Si no sale nada, el aparato está apagado: el nodo solo publica con carga.\n")
    try:
        while len(vistas) < a.n:
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    c.loop_stop(); c.disconnect()
    if vistas:
        for k, nombre in (("v", "Voltaje (V)"), ("i", "Corriente (A)"), ("p", "Potencia (W)")):
            x = [float(d[k]) for d in vistas if d.get(k) is not None]
            if x:
                print(f"{nombre:15} promedio {statistics.mean(x):.3f}")


def cmd_exactitud(a):
    """Error relativo del nodo frente a un instrumento de referencia.
    CSV con columnas: carga,magnitud,nodo,referencia (magnitud = voltaje | corriente | potencia)"""
    import csv
    filas = list(csv.DictReader(open(a.csv, encoding="utf-8-sig")))
    grupos = {}
    for f in filas:
        try:
            n, r = float(str(f["nodo"]).replace(",", ".")), float(str(f["referencia"]).replace(",", "."))
        except (KeyError, ValueError):
            continue
        if r:
            grupos.setdefault((f.get("carga", ""), f.get("magnitud", "")), []).append(100 * abs(n - r) / abs(r))
    if not grupos:
        print("No hay filas válidas. Columnas esperadas: carga,magnitud,nodo,referencia")
        return
    salida = [{"carga": k[0], "magnitud": k[1], "mediciones": len(v), "error_medio_%": round(statistics.mean(v), 2),
               "error_max_%": round(max(v), 2)} for k, v in sorted(grupos.items())]
    todos = [e for v in grupos.values() for e in v]
    salida.append({"carga": "TODAS", "magnitud": "", "mediciones": len(todos),
                   "error_medio_%": round(statistics.mean(todos), 2), "error_max_%": round(max(todos), 2)})
    print("\nExactitud de la medición · ER = |nodo - referencia| / referencia x 100\n")
    tabla(salida, ["carga", "magnitud", "mediciones", "error_medio_%", "error_max_%"])
    print("\nCriterio: error < 1,5 %")


# Usabilidad
def cmd_sus(a):
    """Puntaje SUS desde un CSV con una fila por persona y columnas p1..p10 (valores de 1 a 5)."""
    import csv
    puntajes = []
    for f in csv.DictReader(open(a.csv, encoding="utf-8-sig")):
        try:
            r = [int(float(f[f"p{k}"])) for k in range(1, 11)]
        except (KeyError, ValueError):
            continue
        puntajes.append(2.5 * sum((x - 1) if k % 2 == 0 else (5 - x) for k, x in enumerate(r)))
    if not puntajes:
        print("No hay filas válidas. Columnas esperadas: p1,p2,...,p10 (de 1 a 5)")
        return
    print(f"\nSUS · {len(puntajes)} personas\n")
    tabla([{"persona": k + 1, "puntaje": p} for k, p in enumerate(puntajes)], ["persona", "puntaje"])
    print(f"\nPromedio {statistics.mean(puntajes):.1f}"
          + (f" · desviación {statistics.stdev(puntajes):.1f}" if len(puntajes) > 1 else "")
          + f" · mínimo {min(puntajes):.1f} · máximo {max(puntajes):.1f} · criterio >= 68")


# Consulta libre
def cmd_consulta(a):
    """Ejecuta una consulta Flux (texto o archivo .flux) y la imprime o guarda en CSV.
    En la consulta se puede escribir BUCKET y se reemplaza por el bucket configurado."""
    c, org, bucket = influx()
    flux = Path(a.archivo).read_text(encoding="utf-8") if a.archivo else a.flux
    if not flux:
        print('Indica --flux "..." o --archivo consulta.flux')
        return
    flux = flux.replace("BUCKET", bucket)
    filas = [r.values for t in c.query_api().query(flux, org=org) for r in t.records]
    c.close()
    if not filas:
        print("La consulta no devolvió filas.")
        return
    cols = [k for k in filas[0] if k not in ("result", "table", "_start", "_stop")]
    for f in filas:
        if "_time" in f and hasattr(f["_time"], "astimezone"):
            f["_time"] = f["_time"].astimezone(ZONA).strftime("%Y-%m-%d %H:%M:%S")
    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
            w.writeheader(); w.writerows(filas)
        print(f"{len(filas)} filas guardadas en {a.csv}")
    tabla(filas[:a.max_filas], cols)
    if len(filas) > a.max_filas:
        print(f"... {len(filas) - a.max_filas} filas más (usa --csv para tenerlas todas)")


AYUDA = """
Comandos (PY=/home/luisool/venv/bin/python, desde ~/backend_iot):

 3.4 Resiliencia
   $PY pruebas_capitulo3.py caidas --dias 45 --csv caidas.csv
   $PY pruebas_capitulo3.py carga --minutos 60          (con el sistema en operación normal, sin otras pruebas)
 3.5 Latencia y pérdida
   $PY pruebas_capitulo3.py latencia --dias 45
   $PY pruebas_capitulo3.py perdidas --minutos 30
 3.7 Anomalías
   $PY pruebas_capitulo3.py alertas --dias 30 --csv alertas.csv
 3.8 Predicción
   $PY pruebas_capitulo3.py semanal
 Exactitud de la medición
   $PY pruebas_capitulo3.py medir --nodo nodo_3 --n 10       (lecturas en vivo para comparar con el multímetro)
   $PY pruebas_capitulo3.py exactitud --csv mediciones.csv   (columnas: carga,magnitud,nodo,referencia)
 Usabilidad
   $PY pruebas_capitulo3.py sus --csv sus.csv                (columnas: p1..p10, una fila por persona)
 Cualquier otra cosa de InfluxDB, sin cambiar este archivo
   $PY pruebas_capitulo3.py consulta --flux 'from(bucket:"BUCKET") |> range(start:-1h) |> limit(n:5)'
   $PY pruebas_capitulo3.py consulta --archivo consulta.flux --csv salida.csv

Para que un comando largo siga aunque cierres SSH:
   nohup $PY -u pruebas_capitulo3.py perdidas --minutos 30 > /dev/null 2>&1 &
   (el resultado queda igual en resultados/)
"""


class _Duplicar:
    """Escribe a la vez en la pantalla y en el archivo de resultados."""
    def __init__(self, *destinos):
        self.destinos = destinos

    def write(self, texto):
        for d in self.destinos:
            try:
                d.write(texto); d.flush()
            except Exception:
                pass
        return len(texto)

    def flush(self):
        for d in self.destinos:
            try:
                d.flush()
            except Exception:
                pass


def main():
    p = argparse.ArgumentParser(description="Mediciones del Capítulo 3")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("latencia"); s.add_argument("--dias", type=float, default=7); s.add_argument("--csv")
    s = sub.add_parser("perdidas"); s.add_argument("--minutos", type=float, default=60)
    s.add_argument("--max-salto", dest="max_salto", type=int, default=5,
                   help="máximo de mensajes seguidos faltantes que cuentan como pérdida en tránsito")
    s = sub.add_parser("resiliencia"); s.add_argument("--desde", required=True); s.add_argument("--hasta", required=True)
    s = sub.add_parser("carga"); s.add_argument("--minutos", type=float, default=10)
    s = sub.add_parser("alertas"); s.add_argument("--dias", type=float, default=30); s.add_argument("--csv")
    s = sub.add_parser("semanal"); s.add_argument("--dias", type=float, default=120)
    s = sub.add_parser("medir"); s.add_argument("--nodo", default="nodo_3"); s.add_argument("--n", type=int, default=10)
    s = sub.add_parser("exactitud"); s.add_argument("--csv", required=True)
    s = sub.add_parser("sus"); s.add_argument("--csv", required=True)
    s = sub.add_parser("consulta"); s.add_argument("--flux"); s.add_argument("--archivo"); s.add_argument("--csv")
    s.add_argument("--max-filas", dest="max_filas", type=int, default=50)
    sub.add_parser("ayuda")
    s = sub.add_parser("caidas"); s.add_argument("--dias", type=float, default=45)
    s.add_argument("--min-minutos", dest="min_minutos", type=float, default=2)
    s.add_argument("--csv", help="guardar el detalle de todas las desconexiones en este archivo")
    s.add_argument("--detalle", action="store_true", help="mostrar también la lista completa")
    if len(sys.argv) == 1:
        print(AYUDA); return
    a = p.parse_args()
    if a.cmd == "ayuda":
        print(AYUDA); return
    carpeta = Path(__file__).with_name("resultados")
    carpeta.mkdir(exist_ok=True)
    archivo = carpeta / f"{a.cmd}_{datetime.now(ZONA):%Y%m%d_%H%M}.txt"
    fh = open(archivo, "w", encoding="utf-8")
    fh.write(f"$ {' '.join(sys.argv)}\n")
    sys.stdout = _Duplicar(sys.__stdout__, fh)
    try:
        {"latencia": cmd_latencia, "perdidas": cmd_perdidas, "resiliencia": cmd_resiliencia, "carga": cmd_carga,
         "caidas": cmd_caidas, "alertas": cmd_alertas, "semanal": cmd_semanal, "medir": cmd_medir,
         "exactitud": cmd_exactitud, "sus": cmd_sus, "consulta": cmd_consulta}[a.cmd](a)
    except KeyboardInterrupt:
        print("\nInterrumpido.")
    finally:
        sys.stdout = sys.__stdout__
        fh.close()
        print(f"\n(Salida guardada en {archivo})")


if __name__ == "__main__":
    main()
