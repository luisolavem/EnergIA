// Predicción en barras apiladas por aparato (mismo estilo que "Consumo de hoy
// por hora"). modo "24h": una barra por hora; modo "7d": una barra por día
// (hoy incluye lo ya consumido). Al pasar el mouse o tocar una barra se ve el detalle.
import { useMemo, useState } from 'react'
import { fmtMoneda, fmtNumero } from '../lib/formato.js'
import { horasPrevistas, nombreDia, semanaPrevista } from '../lib/ia.js'
import { Vacio } from './ui.jsx'

const etiquetaHora = (t) => `${new Date(t).getHours()} h`

export default function BarrasPrediccion({ prediccion, nodos = [], tarifaKwh, modo = '24h', altura = 170 }) {
  const [activa, setActiva] = useState(null)
  const porDia = modo === '7d'
  const barras = useMemo(() => {
    if (porDia) {
      const semana = semanaPrevista(prediccion)
      return semana ? semana.dias.map((d) => ({ t: d.t, valores: d.valores, total: d.kwh, hoy: d.hoy })) : []
    }
    return horasPrevistas(prediccion).slice(0, 24)
  }, [prediccion, porDia])

  if (!barras.length) {
    return <Vacio>{porDia && prediccion?.disponible
      ? 'Estos modelos predicen solo 24 horas. Carga los modelos semanales en la Raspberry.'
      : (prediccion?.motivo || 'Todavía no hay predicción.')}</Vacio>
  }

  // Por hora se muestra en Wh; por día, en kWh
  const factor = porDia ? 1 : 1000
  const unidad = porDia ? 'kWh' : 'Wh'
  const decimales = porDia ? 2 : 0
  const maximo = Math.max(...barras.map((b) => b.total), porDia ? 0.5 : 0.02)
  const paso = porDia ? (maximo > 4 ? 1 : 0.5) : (maximo > 0.3 ? 0.1 : maximo > 0.1 ? 0.05 : 0.02)
  const tope = Math.ceil(maximo / paso) * paso
  const marcas = [0, tope / 2, tope]
  const detalle = activa != null ? barras[activa] : null
  const conValor = (b) => nodos.filter((n) => (b.valores[n.id] || 0) > 0)
  const etiqueta = (b) => (porDia ? nombreDia(b.t, b.hoy) : etiquetaHora(b.t))
  const fmt = (kwh) => `${fmtNumero(kwh * factor, decimales)} ${unidad}`

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-xs text-slate-500 num text-right w-16 flex-shrink-0" style={{ height: altura }}>
          {[...marcas].reverse().map((m) => <span key={m}>{fmtNumero(m * factor, porDia ? 1 : 0)} {unidad}</span>)}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-x-0 top-0 flex flex-col justify-between pointer-events-none" aria-hidden="true" style={{ height: altura }}>
            {marcas.map((m) => <span key={m} className="border-t border-slate-100"></span>)}
          </div>
          <div className={`relative flex items-end ${porDia ? 'gap-2' : 'gap-[3px]'}`} style={{ height: altura }} onMouseLeave={() => setActiva(null)}>
            {barras.map((b, i) => (
              <button
                key={b.t}
                type="button"
                onMouseEnter={() => setActiva(i)}
                onFocus={() => setActiva(i)}
                onClick={() => setActiva(i)}
                aria-label={`${etiqueta(b)}: ${fmt(b.total)} previstos`}
                className={`flex-1 h-full flex flex-col-reverse rounded-t-[3px] overflow-hidden ${activa === i ? '' : activa != null ? 'opacity-60' : ''}`}
              >
                {conValor(b).map((n) => (
                  <span key={n.id} className="w-full border-t border-white/70"
                    style={{ height: `${(b.valores[n.id] / tope) * 100}%`, backgroundColor: n.color }}></span>
                ))}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-500 num mt-1.5">
            {porDia
              ? barras.map((b) => <span key={b.t} className="flex-1 text-center">{etiqueta(b)}</span>)
              : [0, 6, 12, 18, barras.length - 1].filter((i) => barras[i]).map((i) => <span key={i}>{etiqueta(barras[i])}</span>)}
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-[2.75rem] text-[13px]">
        {detalle ? (
          <div>
            <p className="font-semibold text-slate-900 num">
              {porDia
                ? `${etiqueta(detalle)}${detalle.hoy ? ' (con lo ya consumido)' : ''}: `
                : `De ${new Date(detalle.t).getHours()}:00 a ${new Date(detalle.t).getHours() + 1}:00: `}
              {fmt(detalle.total)} previstos ({fmtMoneda(detalle.total * tarifaKwh)})
            </p>
            <p className="text-slate-500 flex flex-wrap gap-x-3">
              {conValor(detalle).map((n) => (
                <span key={n.id} className="inline-flex items-center gap-1.5 num">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: n.color }}></span>
                  {n.nombre} {fmt(detalle.valores[n.id])}
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
