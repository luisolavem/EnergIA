"""
Paso 1. Exporta los datos crudos de InfluxDB, tal como estan guardados.

No redondea, filtra ni corrige: es la copia de referencia del conjunto de datos.
Los pasos siguientes (completado y normalizacion) trabajan sobre una copia.

Genera una carpeta crudos_<fecha>/ con:
  lecturas.csv         consumo_electrico: voltaje, corriente, potencia
  cambios_carga.csv    encendidos y apagados de cada aparato
  estado_nodo.csv      conexiones y desconexiones de cada nodo (motivo de reinicio)
  eventos.csv          cortes de energia, reinicios del backend, etc.
  latencia.csv         latencia de entrega de cada lectura (ms)
  energia_horaria.csv  kWh por hora y por nodo (calculado por el backend)
  resumen.txt          conteos por nodo y por dia, rango de fechas y huellas SHA-256
  manifiesto.json      lo mismo en formato legible por programas

Se consulta dia por dia para no agotar la memoria de la Raspberry.

Uso (desde la carpeta del backend):
  python exportar_crudos.py                      # desde el 29 sep hasta ahora
  python exportar_crudos.py --desde 2026-09-29 --hasta 2026-10-26
"""

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from influxdb_client import InfluxDBClient

ZONA_LOCAL = timezone(timedelta(hours=-5))   # Colombia
INICIO_RECOLECCION = "2026-09-29"

# (archivo, measurement, tags, campos)
MEDICIONES = [
    ("lecturas",        "consumo_electrico", ["nodo"], ["voltaje", "corriente", "potencia"]),
    ("cambios_carga",   "cambios_carga",     ["nodo"], ["carga"]),
    ("estado_nodo",     "estado_nodo",       ["nodo"], ["estado", "reset"]),
    ("eventos",         "eventos",           ["tipo"], ["descripcion", "nodos", "duracion_s"]),
    ("latencia",        "latencia",          ["nodo"], ["latencia_ms"]),
    ("energia_horaria", "energia_horaria",   ["nodo"], ["kwh"]),
]


def cargar_env() -> None:
    ruta = Path(__file__).with_name(".env")
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, valor = linea.split("=", 1)
            os.environ.setdefault(clave.strip(), valor.strip().strip('"').strip("'"))


def utc(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def exportar_medicion(api, org, bucket, carpeta, nombre, medicion, tags, campos, inicio, fin):
    """Escribe un CSV consultando un dia a la vez. Devuelve estadisticas."""
    ruta = carpeta / f"{nombre}.csv"
    filtro_campos = " or ".join(f'r._field == "{c}"' for c in campos)
    por_dia = defaultdict(lambda: defaultdict(int))   # dia -> etiqueta -> filas
    total, primera, ultima = 0, None, None

    with ruta.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["fecha_hora_utc", "fecha_hora_local", *tags, *campos])
        dia = inicio
        while dia < fin:
            hasta = min(dia + timedelta(days=1), fin)
            flux = f'''
from(bucket: "{bucket}")
  |> range(start: {utc(dia)}, stop: {utc(hasta)})
  |> filter(fn: (r) => r._measurement == "{medicion}")
  |> filter(fn: (r) => {filtro_campos})
  |> pivot(rowKey: ["_time"{''.join(f', "{t}"' for t in tags)}], columnKey: ["_field"], valueColumn: "_value")
  |> group()
  |> sort(columns: ["_time"])
'''
            for r in api.query_stream(flux, org=org):
                t = r.get_time()
                valores_tags = [r.values.get(tag, "") for tag in tags]
                w.writerow([
                    t.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                    t.astimezone(ZONA_LOCAL).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                    *valores_tags,
                    *["" if r.values.get(c) is None else r.values.get(c) for c in campos],
                ])
                total += 1
                primera = primera or t
                ultima = t
                por_dia[t.astimezone(ZONA_LOCAL).strftime("%Y-%m-%d")][valores_tags[0] or "-"] += 1
            print(f"    {nombre}: {dia.astimezone(ZONA_LOCAL):%Y-%m-%d} listo ({total:,} filas acumuladas)".replace(",", "."),
                  end="\r", flush=True)
            dia = hasta
    print(" " * 90, end="\r")
    return {
        "archivo": ruta.name,
        "filas": total,
        "primera_utc": primera.isoformat() if primera else None,
        "ultima_utc": ultima.isoformat() if ultima else None,
        "por_dia": {d: dict(sorted(v.items())) for d, v in sorted(por_dia.items())},
        "sha256": sha256(ruta),
    }


def escribir_resumen(carpeta, info):
    lineas = [
        "DATOS CRUDOS · EnergIA",
        f"Exportado: {info['exportado']}",
        f"Bucket: {info['bucket']}",
        f"Rango (hora Colombia): {info['desde']}  ->  {info['hasta']}",
        "",
        "Estos archivos NO se modifican. Los pasos de imputacion y limpieza trabajan sobre copias.",
        "",
    ]
    for m in info["mediciones"]:
        lineas.append(f"== {m['archivo']}: {m['filas']:,} filas".replace(",", "."))
        lineas.append(f"   primera: {m['primera_utc']}   ultima: {m['ultima_utc']}")
        lineas.append(f"   sha256: {m['sha256']}")
        if m["archivo"] == "lecturas.csv" and m["por_dia"]:
            nodos = sorted({n for v in m["por_dia"].values() for n in v})
            lineas.append("   Lecturas por dia y nodo:")
            lineas.append("   " + "fecha".ljust(12) + "".join(n.rjust(10) for n in nodos))
            for d, v in m["por_dia"].items():
                lineas.append("   " + d.ljust(12) + "".join(str(v.get(n, 0)).rjust(10) for n in nodos))
        lineas.append("")
    (carpeta / "resumen.txt").write_text("\n".join(lineas), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(description="Exporta los datos crudos de InfluxDB (paso 1)")
    p.add_argument("--desde", default=INICIO_RECOLECCION, help="AAAA-MM-DD, hora de Colombia")
    p.add_argument("--hasta", help="AAAA-MM-DD incluida (por defecto: hasta ahora)")
    a = p.parse_args()

    cargar_env()
    url = os.getenv("INFLUX_URL", "http://localhost:8086")
    token = os.getenv("INFLUX_TOKEN")
    org = os.getenv("INFLUX_ORG", "EnergIA")
    bucket = os.getenv("INFLUX_BUCKET", "datos_consumo_energetico")
    if not token:
        sys.exit("Falta INFLUX_TOKEN (en el .env del backend)")

    inicio = datetime.strptime(a.desde, "%Y-%m-%d").replace(tzinfo=ZONA_LOCAL)
    fin = (datetime.strptime(a.hasta, "%Y-%m-%d").replace(tzinfo=ZONA_LOCAL) + timedelta(days=1)
           if a.hasta else datetime.now(ZONA_LOCAL))
    ahora = datetime.now(ZONA_LOCAL)
    carpeta = Path(__file__).with_name(f"crudos_{ahora:%Y%m%d_%H%M}")
    carpeta.mkdir()

    print(f"Exportando {bucket} del {inicio:%Y-%m-%d %H:%M} al {fin:%Y-%m-%d %H:%M} (hora Colombia)")
    info = {"exportado": ahora.isoformat(timespec="seconds"), "bucket": bucket,
            "desde": inicio.isoformat(), "hasta": fin.isoformat(), "mediciones": []}

    with InfluxDBClient(url=url, token=token, org=org, timeout=300_000) as cliente:
        api = cliente.query_api()
        for nombre, medicion, tags, campos in MEDICIONES:
            try:
                m = exportar_medicion(api, org, bucket, carpeta, nombre, medicion, tags, campos, inicio, fin)
                print(f"  {m['archivo']}: {m['filas']:,} filas".replace(",", "."))
                info["mediciones"].append(m)
            except Exception as e:
                print(f"  {nombre}: ERROR -> {e}")
                info["mediciones"].append({"archivo": f"{nombre}.csv", "filas": 0, "error": str(e),
                                           "primera_utc": None, "ultima_utc": None, "por_dia": {}, "sha256": ""})

    (carpeta / "manifiesto.json").write_text(json.dumps(info, indent=2, ensure_ascii=False), encoding="utf-8")
    escribir_resumen(carpeta, info)
    print(f"Listo. Carpeta: {carpeta}")
    print(f"Revisa {carpeta.name}/resumen.txt antes de copiarla a tu PC.")


if __name__ == "__main__":
    main()
