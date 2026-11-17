"""
Paso 2b. Genera las lecturas cada 2 s de los minutos completados.

Toma las lecturas crudas (paso 1) y les agrega lecturas cada 2 s en los minutos que el
paso 2 completo y en los que el aparato estaba encendido (potencia >= 2,4 W). Los minutos de reposo
no llevan lecturas, igual que en los nodos (no envian datos con el aparato apagado).

Las lecturas reales se copian sin tocarlas. Para cada minuto completado se generan 30 lecturas
(:00, :02 ... :58):
  potencia y corriente  el valor del minuto (paso 2), con la forma de las lecturas reales
                        del mismo minuto en el dia donante; el promedio del minuto se conserva.
                        Sin dia donante (interpolado): rampa lineal entre minutos vecinos.
  voltaje               interpolacion lineal del voltaje por minuto del paso 2, que viene de lo
                        que midieron los otros nodos en ese momento (el voltaje es de la red,
                        no del aparato, por eso no se copia del dia donante).
  Al final, cada lectura agregada se recorta al rango (min-max) que ese aparato midio de verdad
  con el aparato encendido.

Salida (mismo formato que crudos/lecturas.csv, mas la columna aparato despues de nodo):
  lecturas_2s_imputadas.csv   lecturas medidas y completadas, ordenadas por fecha
  tramos_imputados.csv        que tramos se agregaron: nodo, desde, hasta, origen, dia donante
  resumen.txt                 conteos por nodo y huella SHA-256

Uso:
  python imputar_lecturas_2s.py <carpeta_crudos> <carpeta_02_imputados> <carpeta_salida>
"""

import hashlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd

INICIO = pd.Timestamp("2026-09-29 14:00")
FIN = pd.Timestamp("2026-10-27 00:00")
UMBRAL_ENCENDIDO_W = 2.4
IMPUTADOS = ("interpolado", "donante", "donante_largo")
SLOTS = np.arange(30) * 2                       # segundos dentro del minuto
UTC_OFFSET = pd.Timedelta(hours=5)              # Colombia = UTC-5


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    crudos, paso2, salida = map(Path, sys.argv[1:])
    salida.mkdir(parents=True, exist_ok=True)

    raw = pd.read_csv(crudos / "lecturas.csv")
    raw["t"] = pd.to_datetime(raw.fecha_hora_local)
    raw = raw[(raw.t >= INICIO) & (raw.t < FIN)].reset_index(drop=True)

    m = pd.read_csv(paso2 / "lecturas_1min_imputadas.csv", parse_dates=["fecha_hora_local"])
    tz = pd.read_csv(paso2 / "trazabilidad_imputacion.csv", parse_dates=["fecha_hora_local"])
    m = m.merge(tz, on=["fecha_hora_local", "nodo"], validate="one_to_one")

    nuevas, tramos = [], []
    for nodo, mn in m.groupby("nodo"):
        mn = mn.sort_values("fecha_hora_local").reset_index(drop=True)
        r = raw[raw.nodo == nodo].sort_values("t")
        rt = r.t.values.astype("datetime64[ns]").astype(np.int64)
        rP = r.potencia.values
        # Rango medido en este aparato (sin lecturas corruptas)
        ok = r[(r.voltaje.between(80, 260)) & (r.corriente.between(0, 100)) & (r.potencia.between(0, 23_000))]
        lim = {v: (ok[v][ok.potencia >= UMBRAL_ENCENDIDO_W].min(), ok[v].max()) for v in ("voltaje", "corriente", "potencia")}

        # Series por minuto para interpolar (posicion = centro del minuto, en segundos)
        t0 = mn.fecha_hora_local.values.astype("datetime64[s]").astype(np.int64)
        centro = t0 + 30
        objetivo = mn[mn.origen.isin(IMPUTADOS) & (mn.potencia >= UMBRAL_ENCENDIDO_W)]

        for i, f in objetivo.iterrows():
            ts = t0[i] + SLOTS
            P = np.interp(ts + 1, centro, mn.potencia.values)
            I = np.interp(ts + 1, centro, mn.corriente.values)
            V = np.interp(ts + 1, centro, mn.voltaje.values)

            # Forma real del mismo minuto en el dia donante
            if isinstance(f.dia_donante, str) and f.dia_donante:
                d = pd.Timestamp(f.dia_donante) + (f.fecha_hora_local - f.fecha_hora_local.normalize())
                a, b = np.searchsorted(rt, [d.value, (d + pd.Timedelta(minutes=1)).value])
                if b > a and rP[a:b].mean() > 0:
                    k = (np.arange(30) * (b - a)) // 30
                    forma = rP[a:b][k] / rP[a:b].mean()
                    P, I = P * forma, I * forma

            # Conservar el promedio del minuto que calculo el paso 2
            if P.mean() > 0:
                P *= f.potencia / P.mean()
            if I.mean() > 0:
                I *= f.corriente / I.mean()

            # Las lecturas generadas se limitan al rango medido
            P, I, V = (np.clip(P, *lim["potencia"]), np.clip(I, *lim["corriente"]), np.clip(V, *lim["voltaje"]))

            local = pd.to_datetime(ts, unit="s")
            nuevas.append(pd.DataFrame({"t": local, "nodo": nodo, "voltaje": np.round(V, 1),
                                        "corriente": np.round(I, 3), "potencia": np.round(P, 1)}))
            tramos.append((nodo, f.fecha_hora_local, f.origen,
                           f.dia_donante if isinstance(f.dia_donante, str) else ""))

    imp = pd.concat(nuevas, ignore_index=True)
    imp["fecha_hora_utc"] = (imp.t + UTC_OFFSET).dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    imp["fecha_hora_local"] = imp.t.dt.strftime("%Y-%m-%d %H:%M:%S.000")

    cols = ["fecha_hora_utc", "fecha_hora_local", "nodo", "voltaje", "corriente", "potencia"]
    final = pd.concat([raw[cols + ["t"]], imp[cols + ["t"]]], ignore_index=True)
    final = final.sort_values(["t", "nodo"], kind="stable")
    ruta = salida / "lecturas_2s_imputadas.csv"
    final.insert(final.columns.get_loc("nodo") + 1, "aparato", final.nodo.map(dict(zip(m.nodo, m.aparato))))
    final[cols[:3] + ["aparato"] + cols[3:]].to_csv(ruta, index=False)

    # Tramos: minutos consecutivos del mismo nodo, origen y dia donante
    tr = pd.DataFrame(tramos, columns=["nodo", "minuto", "origen", "dia_donante"])
    corte = ((tr.nodo != tr.nodo.shift()) | (tr.origen != tr.origen.shift()) |
             (tr.dia_donante != tr.dia_donante.shift()) |
             (tr.minuto - tr.minuto.shift() != pd.Timedelta(minutes=1)))
    tr["tramo"] = corte.cumsum()
    tt = tr.groupby("tramo").agg(nodo=("nodo", "first"), desde=("minuto", "first"), hasta=("minuto", "last"),
                                 origen=("origen", "first"), dia_donante=("dia_donante", "first"),
                                 minutos=("minuto", "size"))
    tt["hasta"] = tt.hasta + pd.Timedelta(minutes=1)
    tt["lecturas"] = tt.minutos * 30
    tt.to_csv(salida / "tramos_imputados.csv", index=False, date_format="%Y-%m-%d %H:%M:%S")

    reales = raw.groupby("nodo").size()
    agreg = imp.groupby("nodo").size()
    t = pd.DataFrame({"reales": reales, "imputadas": agreg}).fillna(0).astype(int)
    t["total"] = t.reales + t.imputadas
    t.loc["TOTAL"] = t.sum()
    L = ["LECTURAS CADA 2 s CON HUECOS RELLENADOS · EnergIA (01_imputadosV2)",
         f"Periodo (hora Colombia): {INICIO} -> {FIN} (excluido)", "",
         "Lecturas reales: copiadas sin cambios de crudos/lecturas.csv.",
         "Lecturas imputadas: 30 por minuto (segundos pares, milisegundos .000) en los minutos que el",
         "paso 2 imputo con el aparato encendido. Detalle en tramos_imputados.csv.", "",
         t.to_string(), "",
         f"{ruta.name}: {len(final):,} filas".replace(",", "."),
         f"sha256: {sha256(ruta)}"]
    (salida / "resumen.txt").write_text("\n".join(L), encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    main()
