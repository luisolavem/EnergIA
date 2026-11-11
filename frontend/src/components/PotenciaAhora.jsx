// Potencia ahora, por aparato (reemplaza la gráfica de líneas del panel).
// Cada fila: la barra es la potencia actual (todas en la misma escala, para
// comparar aparatos) y la curva pequeña muestra sus últimos 30 minutos
// (cada una en su propia escala, para ver su forma).
import { curvaPotencia } from '../lib/curvas.js'
import { fmtPotencia } from '../lib/formato.js'
import { ESTADO } from '../lib/nodos.js'
import { PuntoAparato, Vacio } from './ui.jsx'

function textoValor(nodo) {
  if (nodo.estado === ESTADO.DESCONECTADO) return { texto: 'Sin conexión', clase: 'text-red-700 font-medium' }
  if (nodo.estado === ESTADO.SIN_DATOS) return { texto: 'Sin datos', clase: 'text-amber-700 font-medium' }
  if (nodo.estado === ESTADO.SIN_CARGA) return { texto: 'Apagado', clase: 'text-slate-500' }
  return { texto: fmtPotencia(nodo.potencia), clase: 'text-slate-900 font-semibold' }
}

export default function PotenciaAhora({ nodos = [], series = {}, ahora = Date.now(), conectado, onSeleccionar }) {
  if (nodos.length === 0) return <Vacio>{conectado ? 'Ningún nodo ha reportado datos todavía.' : 'Sin conexión con el servidor.'}</Vacio>

  // Escala común de las barras: el aparato que más consume ahora (mínimo 50 W)
  const maximo = Math.max(50, ...nodos.map((n) => n.potencia ?? 0))
  const ordenados = [...nodos].sort((a, b) => (b.potencia ?? -1) - (a.potencia ?? -1))

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {ordenados.map((n) => {
          const valor = textoValor(n)
          const curva = curvaPotencia(series[n.id], ahora, 200, 32)
          const ancho = n.potencia != null ? Math.max(0, Math.min(100, (n.potencia / maximo) * 100)) : 0
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSeleccionar?.(n.id)}
                className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(120px,190px)_minmax(0,1fr)_96px_minmax(100px,180px)] gap-x-4 gap-y-2 items-center py-3 text-left rounded-lg hover:bg-slate-50 px-2 -mx-2"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <PuntoAparato color={n.color} />
                  <span className="text-sm text-slate-800 truncate">{n.nombre}</span>
                </span>
                <span className={`text-sm text-right sm:order-3 ${valor.clase}`}>{valor.texto}</span>
                <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden sm:order-2 col-span-2 sm:col-span-1" aria-hidden="true">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${ancho}%`, backgroundColor: n.color }}></span>
                </span>
                <svg viewBox="0 0 200 32" preserveAspectRatio="none" className="hidden sm:block w-full h-8 sm:order-4" aria-hidden="true">
                  {curva.linea
                    ? <path d={curva.linea} fill="none" stroke={n.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    : <line x1="0" x2="200" y1="30" y2="30" stroke="rgb(var(--slate-200))" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
                </svg>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-slate-500 mt-3">
        Barra: potencia actual, en la misma escala para todos. Curva: últimos 30 minutos de cada aparato.
      </p>
    </div>
  )
}
