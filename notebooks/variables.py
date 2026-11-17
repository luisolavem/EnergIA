"""
variables.py · Variables (features) de los modelos de EnergIA.

Este mismo archivo lo usan el notebook de entrenamiento (Colab) y el backend
(Raspberry). Si el backend calcula las variables de otra forma, el modelo
predice valores sin sentido sin dar ningún error; por eso el cálculo vive en
un solo lugar.

Entrada común: una tabla HORARIA con una fila por aparato y hora:
    fecha_hora  (inicio de la hora, hora de Colombia, sin zona horaria)
    aparato     (Nevera1, Nevera2, Router, PC, TVyDeco)
    kwh         (energía consumida en esa hora)
"""

import numpy as np
import pandas as pd

APARATOS = ['Nevera1', 'Nevera2', 'Router', 'PC', 'TVyDeco']
NODO_A_APARATO = {'nodo_1': 'Nevera1', 'nodo_2': 'Nevera2', 'nodo_3': 'Router',
                  'nodo_4': 'PC', 'nodo_5': 'TVyDeco'}

# Festivos de Colombia (Ley Emiliani) 2026 y 2027
FESTIVOS = {pd.Timestamp(d).date() for d in [
    '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
    '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07',
    '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-01',
    '2027-05-10', '2027-05-31', '2027-06-07', '2027-07-05', '2027-07-20', '2027-08-07',
    '2027-08-16', '2027-10-18', '2027-11-01', '2027-11-15', '2027-12-08', '2027-12-25',
]}

# Variables del modelo de predicción, en este orden exacto
VARIABLES_PREDICCION = [
    'hora_sin', 'hora_cos', 'dia_sin', 'dia_cos', 'fin_de_semana_o_festivo',
    'lag24', 'lag48', 'lag168', 'media_dia_anterior', 'media_misma_hora_7d',
    *[f'es_{a}' for a in APARATOS],
]

# Variables del detector de anomalías (por aparato), en este orden exacto
VARIABLES_ANOMALIAS = ['kwh', 'pct_encendido', 'arranques', 'p_encendido_media', 'hora_sin', 'hora_cos']

UMBRAL_ENCENDIDO_W = 2.4   # 0,02 A x 120 V: el mismo umbral de los nodos


def calendario(fechas: pd.Series) -> pd.DataFrame:
    """Hora y día codificados de forma cíclica (las 23 h quedan cerca de las 0 h)."""
    f = pd.to_datetime(fechas)
    hora = f.dt.hour
    dia = f.dt.dayofweek
    festivo = f.dt.date.isin(FESTIVOS)
    return pd.DataFrame({
        'hora_sin': np.sin(2 * np.pi * hora / 24),
        'hora_cos': np.cos(2 * np.pi * hora / 24),
        'dia_sin': np.sin(2 * np.pi * dia / 7),
        'dia_cos': np.cos(2 * np.pi * dia / 7),
        'fin_de_semana_o_festivo': ((dia >= 5) | festivo).astype(int),
    }, index=fechas.index)


def variables_prediccion(horaria: pd.DataFrame) -> pd.DataFrame:
    """Agrega las variables de predicción a la tabla horaria.

    Todas las variables de consumo miran al menos 24 horas atrás: así, con los
    datos hasta "ahora", se pueden predecir de una vez las 24 horas siguientes.
    Las filas sin historia suficiente quedan con NaN (se descartan al entrenar).
    """
    h = horaria.sort_values(['aparato', 'fecha_hora']).copy()
    # Rejilla completa de horas por aparato, para que "24 filas atrás" sea "24 horas atrás"
    partes = []
    for a, g in h.groupby('aparato', sort=False):
        horas = pd.date_range(g.fecha_hora.min(), g.fecha_hora.max(), freq='h')
        g = g.set_index('fecha_hora').reindex(horas)
        g.index.name = 'fecha_hora'
        g['aparato'] = a
        partes.append(g.reset_index())
    h = pd.concat(partes, ignore_index=True)

    k = h.groupby('aparato', sort=False)['kwh']
    for lag in (24, 48, 168):
        h[f'lag{lag}'] = k.shift(lag)
    # Promedio de las 24 horas que terminan 24 horas antes
    h['media_dia_anterior'] = k.transform(lambda s: s.shift(24).rolling(24, min_periods=18).mean())
    # Promedio de la misma hora en los 7 días anteriores
    h['media_misma_hora_7d'] = sum(k.shift(24 * d) for d in range(1, 8)) / 7

    h = pd.concat([h, calendario(h['fecha_hora'])], axis=1)
    for a in APARATOS:
        h[f'es_{a}'] = (h['aparato'] == a).astype(int)
    return h


HORIZONTE_HORAS = 168      # predicción semanal: los próximos 7 días
DIAS_HISTORIA = 9          # historia que necesita cada bloque (lag168 + promedio de 7 días)


def prediccion_recursiva(modelo, historia: pd.DataFrame, inicio, horas: int = HORIZONTE_HORAS) -> pd.DataFrame:
    """Predice `horas` horas desde `inicio` (inclusive) por bloques de 24 horas.

    Cada bloque se predice con las variables de la historia; luego sus predicciones
    se agregan a la historia como si fueran consumo medido y se calcula el bloque
    siguiente. Así el modelo de 24 horas llega a los 7 días.

    historia: tabla horaria (fecha_hora, aparato, kwh) con datos ANTERIORES a `inicio`.
    Devuelve: fecha_hora, aparato, kwh_pred y dia_horizonte (1 = primeras 24 horas).
    """
    inicio = pd.Timestamp(inicio)
    h = historia.loc[(historia.fecha_hora < inicio) &
                     (historia.fecha_hora >= inicio - pd.Timedelta(days=DIAS_HISTORIA)),
                     ['fecha_hora', 'aparato', 'kwh']]
    bloques = []
    for desde in range(0, horas, 24):
        ini = inicio + pd.Timedelta(hours=desde)
        n = min(24, horas - desde)
        futuro = pd.DataFrame([(ini + pd.Timedelta(hours=k), a, np.nan) for a in APARATOS for k in range(n)],
                              columns=['fecha_hora', 'aparato', 'kwh'])
        t = variables_prediccion(pd.concat([h, futuro], ignore_index=True))
        t = t[(t.fecha_hora >= ini) & (t.fecha_hora < ini + pd.Timedelta(hours=n))]
        pred = np.clip(modelo.predict(t[VARIABLES_PREDICCION]), 0, None)
        bloque = t[['fecha_hora', 'aparato']].assign(kwh_pred=pred, dia_horizonte=desde // 24 + 1)
        bloques.append(bloque)
        h = pd.concat([h, bloque.rename(columns={'kwh_pred': 'kwh'})[['fecha_hora', 'aparato', 'kwh']]],
                      ignore_index=True)
    return pd.concat(bloques, ignore_index=True)


def tabla_horaria_desde_minutos(minutos: pd.DataFrame) -> pd.DataFrame:
    """De una tabla por minuto (fecha_hora, aparato, potencia en W, voltaje)
    a la tabla horaria con las variables que usan los dos modelos."""
    m = minutos.copy()
    m['hora_ini'] = m['fecha_hora'].dt.floor('h')
    m['encendido'] = m['potencia'] >= UMBRAL_ENCENDIDO_W
    m = m.sort_values(['aparato', 'fecha_hora'])
    m['arranque'] = m.groupby('aparato')['encendido'].transform(lambda s: s & ~s.shift(1, fill_value=False))
    g = m.groupby(['aparato', 'hora_ini'])
    hor = pd.DataFrame({
        'kwh': g['potencia'].sum() / 60 / 1000,          # W·min -> kWh
        'minutos': g['potencia'].size(),
        'pct_encendido': g['encendido'].mean() * 100,
        'arranques': g['arranque'].sum(),
        'p_encendido_media': g.apply(lambda x: x.loc[x.encendido, 'potencia'].mean() if x.encendido.any() else 0.0),
        'voltaje_medio': g['voltaje'].mean(),
    }).reset_index().rename(columns={'hora_ini': 'fecha_hora'})
    return hor


def variables_anomalias(horaria: pd.DataFrame) -> pd.DataFrame:
    """Variables del detector de anomalías: una fila por aparato y hora."""
    h = horaria.copy()
    cal = calendario(h['fecha_hora'])
    h['hora_sin'], h['hora_cos'] = cal['hora_sin'], cal['hora_cos']
    return h
