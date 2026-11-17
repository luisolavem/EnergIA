// "Próximos 7 días" del residente: cuánto costaría la semana según la IA
// (hoy con lo ya consumido + los 6 días siguientes), con una barra por día.
import { useState } from 'react'
import { fmtMoneda, fmtNumero } from '../lib/formato.js'
import { nombreDia, semanaPrevista } from '../lib/ia.js'
import { Icono, claseTarjeta } from './ui.jsx'

export default function PrediccionSemana({ prediccion, tarifaKwh }) {
  const [activo, setActivo] = useState(null)
  const semana = semanaPrevista(prediccion)
  if (!semana) return null

  const maximo = Math.max(...semana.dias.map((d) => d.kwh), 0.01)
  const detalle = activo != null ? semana.dias[activo] : null

  return (
    <section className={`${claseTarjeta} p-5 md:p-6 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 items-end`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-600">Próximos 7 días</p>
          <span className="text-slate-400 sm:hidden"><Icono nombre="ia" /></span>
        </div>
        <p className="mt-2 text-4xl md:text-[44px] leading-none font-semibold text-slate-900 tracking-tight">
          ~{fmtMoneda(semana.total * tarifaKwh)}
        </p>
        <p className="text-[13px] text-slate-500 mt-3">
          {detalle
            ? `${nombreDia(detalle.t, detalle.hoy)}: ~${fmtMoneda(detalle.kwh * tarifaKwh)} (${fmtNumero(detalle.kwh, 2)} kWh)${detalle.hoy ? ', con lo que ya se consumió hoy' : ''}.`
            : `${fmtNumero(semana.total, 1)} kWh entre hoy y los próximos 6 días.`}
        </p>
        <p className="text-xs text-slate-500 mt-1.5 inline-flex items-center gap-1">
          <Icono nombre="ia" className="w-3.5 h-3.5" />
          Estimado con IA{semana.error != null ? ` (±${fmtNumero(semana.error, 0)} % en la semana)` : ''}
        </p>
      </div>
      <div onMouseLeave={() => setActivo(null)}>
        <div className="flex items-end gap-1.5 h-24" aria-label="Costo estimado de cada día">
          {semana.dias.map((d, i) => (
            <button
              key={d.t}
              type="button"
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onClick={() => setActivo(i)}
              aria-label={`${nombreDia(d.t, d.hoy)}: ${fmtMoneda(d.kwh * tarifaKwh)}`}
              className="flex-1 flex flex-col items-center justify-end h-full"
            >
              <span
                className={`w-full rounded-md ${activo === i ? 'bg-primario-400' : 'bg-primario-200 hover:bg-primario-300'}`}
                style={{ height: `${Math.max(4, (d.kwh / maximo) * 100)}%` }}
              ></span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {semana.dias.map((d) => (
            <span key={d.t} className="flex-1 text-center text-xs text-slate-500">{nombreDia(d.t, d.hoy)}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
