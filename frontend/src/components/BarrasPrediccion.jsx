// Predicción de las próximas 24 horas en barras apiladas por aparato
// (mismo estilo que "Consumo de hoy por hora"). Al pasar el mouse o tocar
// una barra se ve el detalle.
import { useMemo, useState } from 'react'
import { fmtMoneda, fmtNumero } from '../lib/formato.js'
import { horasPrevistas } from '../lib/ia.js'
import { Vacio } from './ui.jsx'

const etiquetaHora = (t) => `${new Date(t).getHours()} h`

export default function BarrasPrediccion({ prediccion, nodos = [], tarifaKwh, altura = 170 }) {
  const [activa, setActiva] = useState(null)
  const horas = useMemo(() => horasPrevistas(prediccion), [prediccion])
  if (!horas.length) return <Vacio>{prediccion?.motivo || 'Todavía no hay predicción.'}</Vacio>

  const maximo = Math.max(...horas.map((h) => h.total), 0.02)
  const paso = maximo > 0.3 ? 0.1 : maximo > 0.1 ? 0.05 : 0.02
  const tope = Math.ceil(maximo / paso) * paso
  const marcas = [0, tope / 2, tope]
  const detalle = activa != null ? horas[activa] : null
  const conValor = (h) => nodos.filter((n) => (h.valores[n.id] || 0) > 0)

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-xs text-slate-500 num text-right w-14 flex-shrink-0" style={{ height: altura }}>
          {[...marcas].reverse().map((m) => <span key={m}>{fmtNumero(m * 1000, 0)} Wh</span>)}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden="true" style={{ height: altura }}>
            {marcas.map((m) => <span key={m} className="border-t border-slate-100"></span>)}
          </div>
          <div className="relative flex items-end gap-[3px]" style={{ height: altura }} onMouseLeave={() => setActiva(null)}>
            {horas.map((h, i) => (
              <button
                key={h.t}
                type="button"
                onMouseEnter={() => setActiva(i)}
                onFocus={() => setActiva(i)}
                onClick={() => setActiva(i)}
                aria-label={`${etiquetaHora(h.t)}: ${fmtNumero(h.total * 1000, 0)} Wh previstos`}
                className={`flex-1 h-full flex flex-col-reverse rounded-t-[3px] overflow-hidden ${activa === i ? '' : activa != null ? 'opacity-60' : ''}`}
              >
                {conValor(h).map((n) => (
                  <span key={n.id} className="w-full border-t border-white/70"
                    style={{ height: `${(h.valores[n.id] / tope) * 100}%`, backgroundColor: n.color }}></span>
                ))}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500 num mt-1.5">
            {[0, 6, 12, 18, horas.length - 1].filter((i) => horas[i]).map((i) => <span key={i}>{etiquetaHora(horas[i].t)}</span>)}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-[2.75rem] text-[13px]">
        {detalle ? (
          <div>
            <p className="font-semibold text-slate-900 num">
              De {new Date(detalle.t).getHours()}:00 a {new Date(detalle.t).getHours() + 1}:00:{' '}
              {fmtNumero(detalle.total * 1000, 0)} Wh previstos ({fmtMoneda(detalle.total * tarifaKwh)})
            </p>
            <p className="text-slate-500 flex flex-wrap gap-x-3">
              {conValor(detalle).map((n) => (
                <span key={n.id} className="inline-flex items-center gap-1.5 num">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: n.color }}></span>
                  {n.nombre} {fmtNumero(detalle.valores[n.id] * 1000, 0)} Wh
                </span>
              ))}
            </p>
          </div>
        ) : (
          <p className="text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
            {nodos.map((n) => (
              <span key={n.id} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: n.color }}></span>
                {n.nombre}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}
