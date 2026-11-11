// Lista de aparatos ordenada por consumo, con una barra proporcional.
// Reemplaza a la dona: las barras alineadas se comparan mucho mejor que los
// ángulos de un círculo, y cada fila puede llevar su estado y su costo.
import { fmtMoneda, fmtNumero } from '../lib/formato.js'
import { EstadoTexto, PuntoAparato, Vacio } from './ui.jsx'

// elementos: [{ id, nombre, color, kwh, estado?: { texto, tono } }]
export default function RankingAparatos({ elementos = [], tarifaKwh, textoVacio, mostrarPesos = true, onSeleccionar }) {
  const total = elementos.reduce((acc, e) => acc + (e.kwh || 0), 0)
  if (!elementos.length || total <= 0) return <Vacio>{textoVacio}</Vacio>

  const ordenados = [...elementos].sort((a, b) => (b.kwh || 0) - (a.kwh || 0))
  const maximo = ordenados[0].kwh || 1

  return (
    <ul className="divide-y divide-slate-100">
      {ordenados.map((e) => {
        const pct = total ? (e.kwh / total) * 100 : 0
        const Fila = onSeleccionar ? 'button' : 'div'
        return (
          <li key={e.id}>
            <Fila
              {...(onSeleccionar ? { type: 'button', onClick: () => onSeleccionar(e.id) } : {})}
              className="w-full text-left grid grid-cols-[10px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center py-3"
            >
              <PuntoAparato color={e.color} />
              <span className="text-sm font-semibold text-slate-900 truncate">{e.nombre}</span>
              <span className="text-sm font-semibold text-slate-900 num text-right">
                {mostrarPesos ? fmtMoneda(e.kwh * tarifaKwh) : `${fmtNumero(e.kwh, 2)} kWh`}
              </span>
              <span></span>
              <span className="min-w-0">
                {e.estado
                  ? <EstadoTexto tono={e.estado.tono}>{e.estado.texto}</EstadoTexto>
                  : <span className="text-[13px] text-slate-500 num">{fmtNumero(pct, 0)} % del total</span>}
              </span>
              <span className="flex items-center gap-2 justify-end">
                <span className="text-xs text-slate-500 num">
                  {mostrarPesos ? `${fmtNumero(e.kwh, 2)} kWh` : fmtMoneda(e.kwh * tarifaKwh)}
                </span>
                <span className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${(e.kwh / maximo) * 100}%`, backgroundColor: e.color }}></span>
                </span>
              </span>
            </Fila>
          </li>
        )
      })}
    </ul>
  )
}
