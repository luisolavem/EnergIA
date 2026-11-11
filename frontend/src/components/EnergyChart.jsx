// Gráfica de los últimos minutos, una línea por nodo.
// Los periodos sin datos (aparato apagado o nodo caído) se dibujan como un
// corte en la línea: nunca se inventan valores entre dos lecturas.
import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { METRICAS, RESOLUCION_GRAFICA_MS, VENTANA_TIEMPO_REAL_MIN } from '../config.js'
import { useTema } from '../hooks/useTema.js'
import { fmtHora, fmtNumero } from '../lib/formato.js'

function construirFilas(nodos, series, metrica, desde, hasta) {
  const filas = new Map()
  for (const nodo of nodos) {
    for (const punto of series[nodo.id] || []) {
      const valor = punto[metrica]
      // Solo puntos dentro de la ventana: uno viejo o con la hora del nodo
      // desfasada estiraba el eje horizontal a varias horas.
      if (valor == null || punto.t < desde || punto.t > hasta) continue
      const t = Math.floor(punto.t / RESOLUCION_GRAFICA_MS) * RESOLUCION_GRAFICA_MS
      const fila = filas.get(t) || { t }
      fila[nodo.id] = valor
      filas.set(t, fila)
    }
  }
  const ordenadas = [...filas.values()].sort((a, b) => a.t - b.t)
  // Fila vacía entre dos filas separadas: obliga a recharts a cortar la línea.
  const resultado = []
  for (const fila of ordenadas) {
    const anterior = resultado[resultado.length - 1]
    if (anterior && fila.t - anterior.t > RESOLUCION_GRAFICA_MS * 1.5) {
      resultado.push({ t: anterior.t + RESOLUCION_GRAFICA_MS })
    }
    resultado.push(fila)
  }
  return resultado
}

function TooltipGrafica({ active, payload, label, metrica }) {
  if (!active || !payload?.length) return null
  const m = METRICAS[metrica]
  const visibles = payload.filter((p) => p.value != null)
  if (!visibles.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-md px-3 py-2 text-[13px] space-y-0.5">
      <p className="text-slate-500 mb-1 num">{fmtHora(label, true)}</p>
      {visibles.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></span>
            {p.name}
          </span>
          <span className="font-semibold text-slate-900 num">{fmtNumero(p.value, m.decimales)} {m.unidad}</span>
        </div>
      ))}
    </div>
  )
}

export default function EnergyChart({ nodos = [], series = {}, metrica = 'potencia', altura = 180, mostrarLeyenda = true }) {
  const { grafica } = useTema()
  const ahora = Date.now()
  const desde = ahora - VENTANA_TIEMPO_REAL_MIN * 60 * 1000
  const filas = useMemo(
    () => construirFilas(nodos, series, metrica, desde, ahora + 5000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodos, series, metrica],
  )
  const m = METRICAS[metrica]

  if (filas.length < 2) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height: altura }}>
        <p className="text-[13px] text-slate-500 text-center px-4">
          {nodos.length ? 'Sin lecturas en los últimos minutos (los nodos solo envían datos con un aparato encendido).' : 'No hay nodos para mostrar.'}
        </p>
      </div>
    )
  }

  const valores = filas.flatMap((f) => nodos.map((n) => f[n.id]).filter((v) => v != null))
  const dominioY = metrica === 'voltaje'
    ? [Math.floor(Math.min(...valores) - 3), Math.ceil(Math.max(...valores) + 3)]
    : [0, 'auto']

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={altura}>
        <LineChart data={filas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grafica.rejilla} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[desde, ahora]}
            allowDataOverflow
            tickFormatter={(t) => fmtHora(t)}
            stroke={grafica.eje}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={dominioY}
            tickFormatter={(v) => fmtNumero(v, metrica === 'corriente' ? 1 : 0)}
            stroke={grafica.eje}
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={62}
            unit={` ${m.unidad}`}
          />
          <Tooltip content={<TooltipGrafica metrica={metrica} />} />
          {nodos.map((n) => (
            <Line
              key={n.id}
              type="monotone"
              dataKey={n.id}
              name={n.nombre}
              stroke={n.color}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {mostrarLeyenda && nodos.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
          {nodos.map((n) => (
            <span key={n.id} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: n.color }}></span>
              {n.nombre}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
