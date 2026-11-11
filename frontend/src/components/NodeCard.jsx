// Tarjeta de un nodo para el técnico.
//   "compacto" (Panel técnico): nombre, potencia y su curva de los últimos
//   30 minutos al pie. El estado solo se escribe en una palabra.
//   "completo" (Nodos): además voltaje y corriente.
import EstadoNodo from './EstadoNodo.jsx'
import { PuntoAparato } from './ui.jsx'
import { curvaPotencia } from '../lib/curvas.js'
import { fmtNumero, fmtPotencia } from '../lib/formato.js'
import { ESTADO } from '../lib/nodos.js'

const ESTADO_CORTO = {
  [ESTADO.ACTIVO]: { texto: 'En línea', clase: 'text-emerald-700' },
  [ESTADO.SIN_CARGA]: { texto: 'Sin carga', clase: 'text-slate-500' },
  [ESTADO.SIN_DATOS]: { texto: 'Sin datos', clase: 'text-amber-700' },
  [ESTADO.DESCONECTADO]: { texto: 'Desconectado', clase: 'text-red-700' },
}

function Medida({ titulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-sm font-semibold text-slate-900 truncate">{valor}</p>
    </div>
  )
}

export default function NodeCard({ nodo, series = {}, ahora, variante = 'compacto', seleccionado = false, onClick }) {
  const borde = seleccionado ? 'border-primario-500 ring-2 ring-primario-500/15' : 'border-slate-200 hover:border-slate-300'

  if (variante === 'completo') {
    return (
      <button type="button" onClick={onClick} className={`w-full text-left rounded-xl border bg-white p-4 transition-colors ${borde}`}>
        <div className="flex items-start gap-2.5">
          <PuntoAparato color={nodo.color} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{nodo.nombreBase}</h3>
            <p className="text-[13px] text-slate-500 truncate">{nodo.ubicacion ? `${nodo.ubicacion} (${nodo.id})` : nodo.id}</p>
          </div>
        </div>
        <div className="mt-3"><EstadoNodo estado={nodo.estado} /></div>
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
          <Medida titulo="Potencia" valor={fmtPotencia(nodo.potencia)} />
          <Medida titulo="Voltaje" valor={nodo.voltaje == null ? '--' : `${fmtNumero(nodo.voltaje, 1)} V`} />
          <Medida titulo="Corriente" valor={nodo.corriente == null ? '--' : `${fmtNumero(nodo.corriente, 2)} A`} />
        </div>
      </button>
    )
  }

  const estado = ESTADO_CORTO[nodo.estado] || ESTADO_CORTO[ESTADO.SIN_DATOS]
  const curva = curvaPotencia(series[nodo.id], ahora, 200, 54)
  const sinValor = nodo.potencia == null
  const [cifra, unidad] = sinValor ? ['--', ''] : fmtPotencia(nodo.potencia).split(' ')

  return (
    <button type="button" onClick={onClick} className={`w-full text-left rounded-2xl border bg-white overflow-hidden transition-colors ${borde}`}>
      <div className="px-4 pt-4">
        <span className="flex items-center gap-2 min-w-0" title={nodo.nombre}>
          <PuntoAparato color={nodo.color} className="w-2 h-2" />
          <span className="text-sm font-medium text-slate-700 truncate">{nodo.nombre}</span>
        </span>
        <div className="mt-2.5 flex items-end justify-between gap-2">
          <p className={`text-[26px] leading-none font-semibold tracking-tight ${sinValor ? 'text-slate-400' : 'text-slate-900'}`}>
            {cifra}{unidad && <span className="text-sm font-medium text-slate-400 ml-1">{unidad}</span>}
          </p>
          <span className={`text-xs whitespace-nowrap ${estado.clase}`}>{estado.texto}</span>
        </div>
      </div>
      <svg viewBox="0 0 200 54" preserveAspectRatio="none" className="block w-full h-[54px] mt-2" aria-hidden="true">
        {curva.area && <path d={curva.area} fill={nodo.color} fillOpacity="0.12" />}
        {curva.linea && <path d={curva.linea} fill="none" stroke={nodo.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {!curva.linea && <line x1="0" x2="200" y1="52" y2="52" stroke="rgb(var(--slate-200))" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
      </svg>
    </button>
  )
}
