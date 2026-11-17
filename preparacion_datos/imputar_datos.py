"""
Paso 2. Completado por minuto de los intervalos sin registro.

Entrada : la carpeta de datos crudos del paso 1 (crudos_AAAAMMDD_HHMM).
Salida  : una carpeta con
  lecturas_1min_imputadas.csv   una fila por nodo y por minuto (solo mediciones)
  trazabilidad_imputacion.csv   procedencia de cada minuto (que se midio y que se imputo)
  reporte_imputacion.txt        cuanto se imputo, con que metodo y error estimado
  validacion_imputacion.csv     resultado de la prueba de reconstruccion

Los datos crudos NO se modifican.

Columnas de lecturas_1min_imputadas.csv
  fecha_hora_local   inicio del minuto (hora de Colombia)
  nodo, aparato
  voltaje            V promedio del minuto
  corriente          A promedio del minuto
  potencia           W promedio del minuto (en los minutos en que el aparato se enciende o se
                     apaga, los segundos apagado cuentan como 0)
  energia_wh         energia consumida en el minuto (Wh)

Columnas de trazabilidad_imputacion.csv (fecha_hora_local, nodo y ademas)
  origen             medido | reposo | interpolado | donante | donante_largo
  origen_voltaje     medido | otro_nodo | imputado
  dia_donante        dia del que se copio el patron (solo donante / donante_largo)
  nivel_donante      A..F: que tan exigente fue la busqueda del dia donante (A = la mejor)

Metodo
  medido        el minuto tiene lecturas validas del sensor.
  reposo        el nodo estaba conectado e informo que el aparato estaba apagado (0 W reales).
  interpolado   hueco de 5 minutos o menos: interpolacion lineal entre los vecinos.
  donante       hueco de mas de 5 min y hasta 24 h: se copia la misma franja horaria del dia
                mas parecido del MISMO aparato (hot-deck).
  donante_largo igual, para huecos de mas de 24 h.
  Busqueda del dia donante, por niveles:
    A mismo tipo de dia (laborable / fin de semana o festivo), >= 90 % de datos en la franja
    B cualquier tipo de dia, >= 90 %
    C mismo tipo, >= 70 %     D cualquier tipo, >= 70 %
    E cualquier tipo, >= 50 % F el dia con mas datos disponible
  Entre los candidatos del primer nivel que tenga alguno, se toman los 5 mas cercanos en
  fechas y se elige el de energia mas cercana al PROMEDIO de esos 5 en la franja
  (un dia tipico, no uno atipico, y sin sesgo en la energia total).
  El voltaje de los minutos no medidos se toma, si existe, del promedio de los otros nodos
  en ese mismo minuto (toda la casa comparte la red electrica).

Uso
  python imputar_datos.py <carpeta_crudos> <carpeta_salida>
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

INICIO = pd.Timestamp("2026-09-29 14:00")
FIN = pd.Timestamp("2026-10-27 00:00")          # excluido: termina el 26 a las 23:59
SEG_POR_LECTURA = 2                              # el nodo publica cada 2 s con carga
MAX_INTERP = 5                                   # minutos
LIM_LARGO = 1440                                 # minutos
FESTIVOS = {pd.Timestamp("2026-10-12").date()}   # Dia de la Raza (lunes festivo)
APARATOS = {"nodo_1": "Nevera · Cocina 1", "nodo_2": "Nevera · Cocina 2", "nodo_3": "Router",
            "nodo_4": "PC", "nodo_5": "TV + decodificador"}
NIVELES = [("A", True, .90), ("B", False, .90), ("C", True, .70),
           ("D", False, .70), ("E", False, .50), ("F", False, 0.0)]
CONOCIDO = ("medido", "reposo", "interpolado")
N_CANDIDATOS = 5                                 # dias candidatos para elegir el donante


def tipo_dia(d):
    return "finde" if (d.weekday() >= 5 or d in FESTIVOS) else "laborable"


# 1. Agregacion por minuto de las lecturas validas
def cargar_minutos(D):
    l = pd.read_csv(D / "lecturas.csv", usecols=["fecha_hora_local", "nodo", "voltaje", "corriente", "potencia"],
                    parse_dates=["fecha_hora_local"])
    l = l[(l.fecha_hora_local >= INICIO) & (l.fecha_hora_local < FIN)]
    # Valores fisicamente imposibles (tramas Modbus corruptas). Lo dudoso pero posible
    # (p. ej. voltajes bajos) se conserva: se revisa en el paso 3.
    invalida = ~l.voltaje.between(50, 300) | (l.potencia > 10_000) | (l.corriente > 50) | (l.potencia < 0)
    n_invalidas = int(invalida.sum())
    l = l[~invalida]
    l["minuto"] = l.fecha_hora_local.dt.floor("1min")
    g = l.groupby(["nodo", "minuto"]).agg(n=("potencia", "size"), V=("voltaje", "mean"),
                                         I=("corriente", "mean"), P=("potencia", "mean"))
    # Fraccion del minuto cubierta por lecturas. Solo se usa en los minutos en que el aparato
    # se encendio o se apago (ver construir()); si faltan lecturas por perdida de red, el
    # minuto se representa con el promedio de las lecturas recibidas.
    g["frac"] = np.minimum(1.0, g.n * SEG_POR_LECTURA / 60)
    return g, n_invalidas


def estados(D, idx):
    cc = pd.read_csv(D / "cambios_carga.csv", parse_dates=["fecha_hora_local"]).sort_values("fecha_hora_local")
    es = pd.read_csv(D / "estado_nodo.csv", parse_dates=["fecha_hora_local"]).sort_values("fecha_hora_local")
    out = {}
    for n in APARATOS:
        c = cc[cc.nodo == n].set_index("fecha_hora_local").carga
        c = c.groupby(c.index.floor("1min")).last()
        e = es[es.nodo == n].set_index("fecha_hora_local").estado
        e = e.groupby(e.index.floor("1min")).last()
        # el estado vigente en el minuto es el ultimo registrado hasta ese minuto (desde antes del inicio)
        c = c.reindex(c.index.union(idx)).ffill().reindex(idx)
        e = e.reindex(e.index.union(idx)).ffill().reindex(idx)
        out[n] = ((c == "reposo") & (e == "online")).values
    return out


# 2. Imputacion
def rachas(mask):
    """Devuelve [(inicio, fin_excluido)] de los tramos True."""
    m = np.concatenate([[False], mask, [False]]).astype(int)
    d = np.diff(m)
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def interpolar(arr, a, b):
    """Interpola linealmente arr[a:b] usando arr[a-1] y arr[b]."""
    x0, x1 = arr[a - 1], arr[b]
    if np.isnan(x0) or np.isnan(x1):
        return False
    arr[a:b] = x0 + (x1 - x0) * (np.arange(1, b - a + 1) / (b - a + 1))
    return True


def imputar_nodo(n, df, idx, dias, tipos):
    P, I, V = df.P.values.copy(), df.I.values.copy(), df.V.values.copy()
    origen = df.origen.values.copy()
    donante = np.full(len(idx), "", dtype=object)
    nivel = np.full(len(idx), "", dtype=object)
    hueco = ~np.isin(origen, ["medido", "reposo"])

    # Etapa 1: huecos cortos
    largos = []
    for a, b in rachas(hueco):
        if b - a <= MAX_INTERP and a > 0 and b < len(idx) and interpolar(P, a, b):
            interpolar(I, a, b)
            origen[a:b] = "interpolado"
        else:
            largos.append((a, b))

    # Matriz dia x minuto para buscar donantes (solo minutos conocidos de verdad)
    pos_dia = {d: i for i, d in enumerate(dias)}
    off = int((idx[0] - pd.Timestamp(dias[0])) / pd.Timedelta("1min"))   # minuto del dia del primer indice
    nd = len(dias)
    K = np.zeros((nd, 1440), bool)
    MP = np.full((nd, 1440), np.nan); MI = MP.copy(); MV = MP.copy()
    flat = np.arange(len(idx)) + off
    K.flat[flat] = np.isin(origen, CONOCIDO)
    MP.flat[flat] = P; MI.flat[flat] = I; MV.flat[flat] = V
    cumK = np.concatenate([np.zeros((nd, 1)), np.cumsum(K, axis=1)], axis=1)

    # Etapa 2: huecos largos, por trozos de un mismo dia calendario
    for a, b in largos:
        etiqueta = "donante_largo" if (b - a) > LIM_LARGO else "donante"
        i = a
        while i < b:
            k = i + off
            d, m0 = divmod(k, 1440)
            m1 = min(1440, m0 + (b - i))
            cobertura = (cumK[:, m1] - cumK[:, m0]) / (m1 - m0)
            cobertura[d] = -1                                        # nunca el mismo dia
            elegido, niv = None, None
            for nombre, mismo_tipo, umbral in NIVELES:
                cand = [j for j in range(nd) if cobertura[j] >= umbral and cobertura[j] > 0
                        and (not mismo_tipo or tipos[j] == tipos[d])]
                if cand:
                    # De los 5 dias candidatos mas cercanos se toma el de energia mas parecida al
                    # PROMEDIO de la franja: conserva la forma real del consumo, evita copiar un dia
                    # atipico y no subestima aparatos de uso irregular (PC, TV).
                    cercanos = sorted(cand, key=lambda j: (abs(j - d), j))[:N_CANDIDATOS]
                    energia = {j: np.nansum(np.where(K[j, m0:m1], MP[j, m0:m1], 0)) for j in cercanos}
                    media = np.mean(list(energia.values()))
                    elegido = min(cercanos, key=lambda j: (abs(energia[j] - media), abs(j - d)))
                    niv = nombre
                    break
            sl = slice(i, i + (m1 - m0))
            if elegido is not None:
                kk = K[elegido, m0:m1]
                P[sl] = np.where(kk, MP[elegido, m0:m1], np.nan)
                I[sl] = np.where(kk, MI[elegido, m0:m1], np.nan)
                Vd = np.where(kk, MV[elegido, m0:m1], np.nan)
                V[sl] = np.where(np.isnan(V[sl]), Vd, V[sl])
                donante[sl] = str(dias[elegido])
                nivel[sl] = niv
            origen[sl] = etiqueta
            i += m1 - m0

    # Huecos residuales (minutos que tampoco tenia el donante): interpolacion
    resto = np.isnan(P)
    P = pd.Series(P).interpolate(limit_direction="both").values
    I = pd.Series(I).interpolate(limit_direction="both").values
    return P, I, V, origen, donante, nivel, int(resto.sum())


def construir(D):
    idx = pd.date_range(INICIO, FIN, freq="1min", inclusive="left")
    dias = sorted({t.date() for t in idx})
    tipos = [tipo_dia(d) for d in dias]
    g, n_invalidas = cargar_minutos(D)
    reposo = estados(D, idx)

    tablas = {}
    for n in APARATOS:
        df = g.loc[n].reindex(idx) if n in g.index.get_level_values(0) else pd.DataFrame(index=idx, columns=["n", "V", "I", "P", "frac"])
        df = df.astype(float)
        df["origen"] = np.where(df.n > 0, "medido", np.where(reposo[n], "reposo", "hueco"))
        # Minutos de transicion (vecino en reposo): el aparato estuvo encendido solo parte
        # del minuto, asi que el promedio se pondera por la fraccion con lecturas.
        r = (df.origen == "reposo")
        transicion = (df.origen == "medido") & (r.shift(1, fill_value=False) | r.shift(-1, fill_value=False) | pd.Series(reposo[n], index=idx))
        df.loc[transicion, "P"] = df.P * df.frac
        df.loc[transicion, "I"] = df.I * df.frac
        df.loc[df.origen == "reposo", ["P", "I"]] = 0.0
        tablas[n] = df

    # Voltaje compartido: promedio de los nodos medidos en ese minuto
    Vmed = pd.DataFrame({n: tablas[n].V.where(tablas[n].origen == "medido") for n in APARATOS})
    V_otros = {n: Vmed.drop(columns=n).mean(axis=1) for n in APARATOS}

    salida, residuales = [], {}
    for n in APARATOS:
        df = tablas[n]
        ov = np.where(df.origen == "medido", "medido", np.where(V_otros[n].notna(), "otro_nodo", "imputado"))
        df["V"] = np.where(df.origen == "medido", df.V, V_otros[n])
        P, I, V, origen, donante, nivel, resto = imputar_nodo(n, df, idx, dias, tipos)
        V = pd.Series(V).interpolate(limit_direction="both").values
        residuales[n] = resto
        salida.append(pd.DataFrame({
            "fecha_hora_local": idx, "nodo": n, "aparato": APARATOS[n],
            "voltaje": np.round(V, 2), "corriente": np.round(I, 4), "potencia": np.round(P, 2),
            "energia_wh": np.round(P / 60, 5), "origen": origen, "origen_voltaje": ov,
            "dia_donante": donante, "nivel_donante": nivel}))
    return pd.concat(salida, ignore_index=True), n_invalidas, residuales, dias, tipos


# 3. Validacion: se borran tramos que SI se midieron, se reconstruyen con el
#    mismo metodo y se compara la energia reconstruida con la real.
def validar(final, dias, tipos, semilla=7):
    rng = np.random.default_rng(semilla)
    idx = pd.DatetimeIndex(final.fecha_hora_local.unique())
    filas = []
    for n in APARATOS:
        f = final[final.nodo == n].reset_index(drop=True)
        base = f[["potencia", "corriente", "voltaje"]].rename(columns={"potencia": "P", "corriente": "I", "voltaje": "V"})
        base["origen"] = np.where(f.origen.isin(["medido", "reposo"]), f.origen, "hueco")
        conocido = base.origen.isin(["medido", "reposo"]).values
        for horas in (1, 6, 24):
            L = horas * 60
            ok = np.convolve(conocido, np.ones(L), "valid") >= L * 0.98
            inicios = np.where(ok)[0]
            if len(inicios) == 0:
                continue
            for a in rng.choice(inicios, size=min(30, len(inicios)), replace=False):
                prueba = base.copy()
                real = prueba.P.values[a:a + L].sum() / 60
                prueba.loc[a:a + L - 1, ["P", "I"]] = np.nan
                prueba.loc[a:a + L - 1, "origen"] = "hueco"
                P, *_ = imputar_nodo(n, prueba, idx, dias, tipos)
                rec = P[a:a + L].sum() / 60
                filas.append({"nodo": n, "aparato": APARATOS[n], "horas": horas, "energia_real_wh": real,
                              "energia_reconstruida_wh": rec, "error_abs_wh": abs(rec - real),
                              "error_pct": abs(rec - real) / real * 100 if real > 1 else np.nan})
    return pd.DataFrame(filas)


def reporte(final, val, n_invalidas, residuales, salida):
    L = []
    L.append("REPORTE DE IMPUTACION · EnergIA")
    L.append(f"Periodo: {INICIO:%Y-%m-%d %H:%M} -> {FIN - pd.Timedelta('1min'):%Y-%m-%d %H:%M} (hora Colombia), resolucion 1 minuto")
    L.append(f"Lecturas descartadas por valores fisicamente imposibles: {n_invalidas}")
    L.append("")
    L.append("% de minutos por origen")
    t = (pd.crosstab(final.aparato, final.origen, normalize="index") * 100).round(1)
    orden = [c for c in ["medido", "reposo", "interpolado", "donante", "donante_largo"] if c in t]
    t = t[orden]
    t["total_imputado"] = t.drop(columns=[c for c in ["medido", "reposo"] if c in t]).sum(axis=1).round(1)
    L.append(t.to_string())
    L.append("")
    L.append("Energia total por origen (kWh)")
    e = final.pivot_table(index="aparato", columns="origen", values="energia_wh", aggfunc="sum").fillna(0) / 1000
    e = e[[c for c in orden if c in e]]
    e["total"] = e.sum(axis=1)
    L.append(e.round(2).to_string())
    L.append("")
    L.append("Nivel de busqueda del dia donante (% de minutos imputados por donante)")
    d = final[final.nivel_donante != ""]
    L.append((pd.crosstab(d.aparato, d.nivel_donante, normalize="index") * 100).round(1).to_string())
    L.append("")
    L.append("Minutos residuales interpolados (sin dato tampoco en el donante): "
             + ", ".join(f"{APARATOS[n]}={v}" for n, v in residuales.items()))
    L.append("")
    L.append("VALIDACION: error al reconstruir tramos que si se midieron (mediana del error en energia)")
    v = val.groupby(["aparato", "horas"]).agg(pruebas=("error_pct", "size"),
                                             error_mediano_pct=("error_pct", "median"),
                                             error_p90_pct=("error_pct", lambda s: s.quantile(.9))).round(1)
    L.append(v.to_string())
    L.append("")
    L.append("Notas")
    L.append("- 'donante' y 'donante_largo' NO son mediciones: son patrones copiados del mismo aparato.")
    L.append("  Para entrenar el detector de anomalias usar solo origen in {medido, reposo, interpolado}.")
    L.append("- La nevera 2 tiene la mayor parte del periodo reconstruida a partir de sus pocos dias buenos")
    L.append("  (falla fisica: el nodo estaba lejos del router). Reportarlo como limitacion del dataset.")
    (salida / "reporte_imputacion.txt").write_text("\n".join(L), encoding="utf-8")
    return "\n".join(L)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    D, salida = Path(sys.argv[1]), Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)
    print("Construyendo el dataset por minuto e imputando huecos...")
    final, n_inv, residuales, dias, tipos = construir(D)
    medicion = ["fecha_hora_local", "nodo", "aparato", "voltaje", "corriente", "potencia", "energia_wh"]
    procedencia = ["fecha_hora_local", "nodo", "origen", "origen_voltaje", "dia_donante", "nivel_donante"]
    final[medicion].to_csv(salida / "lecturas_1min_imputadas.csv", index=False, date_format="%Y-%m-%d %H:%M:%S")
    final[procedencia].to_csv(salida / "trazabilidad_imputacion.csv", index=False, date_format="%Y-%m-%d %H:%M:%S")
    print("Validando el metodo (reconstruccion de tramos medidos)...")
    val = validar(final, dias, tipos)
    val.round(3).to_csv(salida / "validacion_imputacion.csv", index=False)
    print(reporte(final, val, n_inv, residuales, salida))


if __name__ == "__main__":
    main()
