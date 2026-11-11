// Vista de alertas. Preparada para el módulo de detección de anomalías:
// mientras dure la recolección de datos, App.jsx envía moduloActivo={false}.
//
// Para activarla más adelante basta con pasar:
//   moduloActivo={true}
//   alertas={[{ id, nodo, nombreNodo, tipo, severidad: 'critica'|'advertencia'|'info', mensaje, timestamp }]}
import { fmtFechaHora } from '../lib/formato.js'

const SEVERIDAD = {
  critica: { texto: 'Crítica', clases: 'bg-red-50 text-red-700 border-red-200' },
  advertencia: { texto: 'Advertencia', clases: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { texto: 'Información', clases: 'bg-slate-100 text-slate-600 border-slate-200' },
}

function EstadoVacio({ icono, titulo, texto, tono }) {
  return (
    <div className="bg-white p-8 rounded-2xl border border-slate-200/60 text-center space-y-3">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${tono}`}>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icono} />
        </svg>
      </div>
      <h3 className="font-bold text-slate-800 text-base">{titulo}</h3>
      <p className="text-xs text-slate-400 max-w-md mx-auto">{texto}</p>
    </div>
  )
}

export default function Alertas({ alertas = [], moduloActivo = false }) {
  if (!moduloActivo) {
    return (
      <EstadoVacio
        icono="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        tono="bg-slate-100 text-slate-500"
        titulo="Módulo de anomalías en preparación"
        texto="El sistema está en fase de recolección de datos. Cuando el modelo de detección de anomalías esté entrenado con las mediciones de este hogar, las alertas aparecerán aquí."
      />
    )
  }

  if (alertas.length === 0) {
    return (
      <EstadoVacio
        icono="M5 13l4 4L19 7"
        tono="bg-emerald-50 text-emerald-600"
        titulo="Sin alertas activas"
        texto="El modelo no ha detectado comportamientos anómalos."
      />
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm divide-y divide-slate-100">
      {alertas.map((a) => {
        const s = SEVERIDAD[a.severidad] || SEVERIDAD.info
        return (
          <div key={a.id} className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">{a.nombreNodo || a.nodo} · {a.tipo}</p>
              <p className="text-xs text-slate-500 mt-0.5">{a.mensaje}</p>
              <p className="text-[10px] text-slate-400 mt-1">{fmtFechaHora(Date.parse(a.timestamp))}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${s.clases}`}>{s.texto}</span>
          </div>
        )
      })}
    </div>
  )
}
