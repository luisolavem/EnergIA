// Tarjeta "Hoy" del residente: lo que lleva costando el día y, con la
// predicción de la IA, en cuánto va a cerrar a la medianoche.
import { fmtMoneda, fmtNumero } from '../lib/formato.js'
import { restoDelDia } from '../lib/ia.js'
import { Icono, claseTarjeta } from './ui.jsx'

export default function PrediccionHoy({ kwhHoy, prediccion, errorPrediccion, tarifaKwh }) {
  const resto = restoDelDia(prediccion)
  const estimado = kwhHoy != null && resto ? kwhHoy + resto.total : null
  const avance = estimado ? Math.min(100, (kwhHoy / estimado) * 100) : 0
  const margen = prediccion?.error_esperado_pct

  return (
    <div className={`${claseTarjeta} p-5 min-w-0 flex flex-col`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600">Hoy</p>
        <span className="text-slate-400 flex-shrink-0"><Icono nombre="calendario" /></span>
      </div>
      <p className="mt-2 font-semibold text-slate-900 tracking-tight text-[28px] leading-9">
        {kwhHoy == null ? '--' : fmtMoneda(kwhHoy * tarifaKwh)}
      </p>
      <p className="text-[13px] text-slate-500 mt-1.5 truncate">
        {kwhHoy == null ? 'Calculando...' : `${fmtNumero(kwhHoy, 2)} kWh desde la medianoche`}
      </p>

      {estimado != null ? (
        <div className="mt-auto pt-4">
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
            <span className="block h-full rounded-full bg-primario-500" style={{ width: `${avance}%` }}></span>
          </div>
          <p className="text-[13px] text-slate-700 mt-2">
            Al final del día: <span className="font-semibold text-slate-900">~{fmtMoneda(estimado * tarifaKwh)}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
            <Icono nombre="ia" className="w-3.5 h-3.5" />
            Estimado con IA{margen != null ? ` (±${fmtNumero(margen, 0)} %)` : ''}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 mt-auto pt-4">
          {errorPrediccion || prediccion?.motivo || 'Calculando el estimado del día...'}
        </p>
      )}
    </div>
  )
}
