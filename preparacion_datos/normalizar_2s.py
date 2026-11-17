"""
Paso 3. Normaliza las lecturas cada 2 s (lecturas_2s_imputadas.csv).

Pasos:
  1. Rango fisico del sensor PZEM-004T v3: 80-260 V, 0-100 A, 0-23 kW.
     Una lectura fuera de rango es un error del sensor y se elimina.
  2. Division cronologica en dias completos:
       entrenamiento  29 sep - 18 oct
       validacion     19 - 22 oct
       prueba         23 - 26 oct
  3. MinMax por aparato y por variable (voltaje, corriente, potencia):
       x_norm = (x - min) / (max - min)
     min y max se calculan SOLO con lecturas reales del conjunto de entrenamiento (las lecturas
     agregadas se reconocen con tramos_imputados.csv). Validacion y prueba usan esos mismos
     valores, por eso pueden quedar levemente fuera de [0, 1].

Salida:
  lecturas_2s_normalizadas.csv     columnas originales + conjunto + *_norm
  parametros_normalizacion_2s.json min y max por aparato (para desnormalizar predicciones)
  reporte_normalizacion_2s.txt

Uso:
  python normalizar_2s.py <carpeta_01_imputadosV2> <carpeta_salida>
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RANGO_SENSOR = {"voltaje": (80, 260), "corriente": (0, 100), "potencia": (0, 23_000)}
FIN_ENTRENAMIENTO = pd.Timestamp("2026-10-19 00:00")
FIN_VALIDACION = pd.Timestamp("2026-10-23 00:00")
VARS = ["voltaje", "corriente", "potencia"]
APARATOS = {"nodo_1": "Nevera · Cocina 1", "nodo_2": "Nevera · Cocina 2", "nodo_3": "Router",
            "nodo_4": "PC", "nodo_5": "TV + decodificador"}


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    entrada, salida = map(Path, sys.argv[1:])
    salida.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(entrada / "lecturas_2s_imputadas.csv")
    t = pd.to_datetime(df.fecha_hora_local)
    L = ["NORMALIZACION · lecturas cada 2 s (01_imputadosV2)", "", f"Filas de entrada: {len(df):,}".replace(",", ".")]

    # Lecturas medidas y completadas (segun los tramos del paso anterior)
    tr = pd.read_csv(entrada / "tramos_imputados.csv", parse_dates=["desde", "hasta"])
    real = np.ones(len(df), bool)
    for nodo, g in tr.groupby("nodo"):
        sel = (df.nodo == nodo).values
        tn = t[sel].values
        a = np.searchsorted(g.desde.values, tn, side="right") - 1
        dentro = (a >= 0) & (tn < g.hasta.values[np.clip(a, 0, None)])
        idx = np.where(sel)[0]
        real[idx[dentro]] = False

    # 1. Rango fisico
    fuera = np.zeros(len(df), bool)
    L += ["", "1. Rango fisico del sensor (lecturas eliminadas)"]
    for v, (lo, hi) in RANGO_SENSOR.items():
        f = (df[v] < lo) | (df[v] > hi)
        L.append(f"   {v} fuera de [{lo}, {hi}]: {int(f.sum())}")
        fuera |= f.values
    for _, r in df[fuera].iterrows():
        L.append(f"     {r.fecha_hora_local}  {r.nodo}  {r.voltaje} V  {r.corriente} A  {r.potencia} W")
    df, t, real = df[~fuera].reset_index(drop=True), t[~fuera].reset_index(drop=True), real[~fuera]
    L.append(f"   Filas despues del filtro: {len(df):,}".replace(",", "."))

    # 2. Division cronologica
    df["conjunto"] = np.where(t < FIN_ENTRENAMIENTO, "entrenamiento",
                              np.where(t < FIN_VALIDACION, "validacion", "prueba"))
    L += ["", "2. Division cronologica (filas)"]
    c = pd.crosstab(df.conjunto, np.where(real, "reales", "agregadas"), margins=True, margins_name="total")
    L.append(c.reindex(["entrenamiento", "validacion", "prueba", "total"]).to_string())

    # 3. MinMax por aparato, ajustado con lecturas reales de entrenamiento
    ajuste = df[(df.conjunto == "entrenamiento") & real]
    params = {"metodo": "MinMax por aparato y variable: (x - min) / (max - min)",
              "ajustado_con": "lecturas reales del conjunto de entrenamiento (29 sep - 18 oct)",
              "aparatos": {}}
    L += ["", "3. MinMax (min y max de entrenamiento, lecturas reales)"]
    for nodo, g in ajuste.groupby("nodo"):
        params["aparatos"][nodo] = {"aparato": APARATOS[nodo]}
        for v in VARS:
            lo, hi = float(g[v].min()), float(g[v].max())
            params["aparatos"][nodo][v] = {"min": lo, "max": hi}
            m = df.nodo == nodo
            df.loc[m, f"{v}_norm"] = ((df.loc[m, v] - lo) / (hi - lo) if hi > lo else 0.0).round(5)
            L.append(f"   {APARATOS[nodo]:<20} {v:<10} min {lo:>8}  max {hi:>8}")
    L += ["", "Rango de los valores normalizados por conjunto (validacion y prueba pueden salir de [0, 1]):"]
    L.append(df.groupby("conjunto")[[f"{v}_norm" for v in VARS]].agg(["min", "max"]).round(3).to_string())

    df.to_csv(salida / "lecturas_2s_normalizadas.csv", index=False)
    (salida / "parametros_normalizacion_2s.json").write_text(json.dumps(params, indent=2, ensure_ascii=False), encoding="utf-8")
    L += ["", f"Filas de salida: {len(df):,}".replace(",", ".")]
    (salida / "reporte_normalizacion_2s.txt").write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    main()
