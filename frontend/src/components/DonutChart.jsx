// Dona de distribución de energía por nodo (vista del técnico).
// Anillo delgado con separación entre tramos; al pasar el mouse por un tramo
// o por su fila se resalta y el centro muestra su valor.
// elementos: [{ id, nombre, color, valor }]
import { useState } from 'react'
import { fmtNumero } from '../lib/formato.js'
import { PuntoAparato, Vacio } from './ui.jsx'

const R = 70          // radio del anillo
const GROSOR = 14
const SEPARACION = 2.2 // grados entre tramos

function arco(a0, a1) {
  const p = (a) => [100 + R * Math.cos((a - 90) * Math.PI / 180), 100 + R * Math.sin((a - 90) * Math.PI / 180)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export default function DonutChart({ elementos = [], unidad = 'kWh', decimales = 2, textoVacio = 'Sin consumo registrado', onSeleccionar }) {
  const [activo, setActivo] = useState(null)
  const total = elementos.reduce((acc, e) => acc + (e.valor || 0), 0)
  if (!elementos.length || total <= 0) return <Vacio>{textoVacio}</Vacio>

  const ordenados = [...elementos].sort((a, b) => (b.valor || 0) - (a.valor || 0))
  const conValor = ordenados.filter((e) => e.valor > 0)
  const separacion = conValor.length > 1 ? SEPARACION : 0
  let angulo = 0
  const tramos = conValor.map((e) => {
    const barrido = (e.valor / total) * 360
    const t = { ...e, a0: angulo + separacion / 2, a1: angulo + barrido - separacion / 2 }
    angulo += barrido
    return t
  })
  const elegido = activo ? ordenados.find((e) => e.id === activo) : null

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-44 h-44 flex-shrink-0">
        <svg viewBox="0 0 200 200" className="w-full h-full" role="img" aria-label="Distribución de la energía por nodo">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--slate-100))" strokeWidth={GROSOR} />
          {tramos.map((t) => (
            <path
              key={t.id}
              d={tramos.length === 1 ? `M 100 ${100 - R} A ${R} ${R} 0 1 1 99.99 ${100 - R}` : arco(t.a0, Math.max(t.a1, t.a0 + 0.5))}
              fill="none"
              stroke={t.color}
              strokeWidth={activo === t.id ? GROSOR + 4 : GROSOR}
              strokeLinecap="butt"
              opacity={activo && activo !== t.id ? 0.35 : 1}
              onMouseEnter={() => setActivo(t.id)}
              onMouseLeave={() => setActivo(null)}
              style={{ transition: 'opacity 150ms, stroke-width 150ms', cursor: onSeleccionar ? 'pointer' : 'default' }}
              onClick={() => onSeleccionar?.(t.id)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-8">
          <span className="text-2xl font-semibold text-slate-900 tracking-tight">
            {fmtNumero(elegido ? elegido.valor : total, decimales)}
          </span>
          <span className="text-xs text-slate-500 truncate max-w-full">
            {elegido ? elegido.nombre : `${unidad} en total`}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-0.5">
        {ordenados.map((e) => {
          const pct = total > 0 ? ((e.valor || 0) / total) * 100 : 0
          const Fila = onSeleccionar ? 'button' : 'div'
          return (
            <li key={e.id}>
              <Fila
                {...(onSeleccionar ? { type: 'button', onClick: () => onSeleccionar(e.id) } : {})}
                onMouseEnter={() => setActivo(e.id)}
                onMouseLeave={() => setActivo(null)}
                className={`w-full flex items-center justify-between gap-3 px-2 py-2 rounded-lg text-left transition-colors ${activo === e.id ? 'bg-slate-100' : ''}`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <PuntoAparato color={e.color} />
                  <span className="text-sm text-slate-700 leading-snug">{e.nombre}</span>
                </span>
                <span className="flex items-baseline gap-3 whitespace-nowrap">
                  <span className="text-[13px] text-slate-500">{fmtNumero(e.valor || 0, decimales)} {unidad}</span>
                  <span className="text-sm font-semibold text-slate-900 w-10 text-right">{fmtNumero(pct, 0)} %</span>
                </span>
              </Fila>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
