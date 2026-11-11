// Eventos y registros (solo técnico): conexiones, cortes, lecturas y consola.
import { useState } from 'react'
import { Tarjeta } from '../../components/ui.jsx'
import { MOTIVOS_REINICIO, fmtDuracion, fmtFechaHora, fmtNumero } from '../../lib/formato.js'
import { nombrePorDefecto } from '../../lib/nodos.js'

const NIVELES = {
  critico: 'bg-red-500',
  aviso: 'bg-amber-500',
  info: 'bg-slate-300',
  ok: 'bg-emerald-500',
}

// Convierte una entrada de la bitácora en texto legible y nivel de importancia.
function describir(entrada, nombreDe) {
  const d = entrada.detalle || {}
  const nombre = entrada.nodo ? nombreDe(entrada.nodo) : ''
  switch (entrada.tipo) {
    case 'estado':
      if (d.estado === 'offline') return { nivel: 'aviso', texto: `${nombre} se desconectó` }
      return {
        nivel: 'ok',
        texto: d.reset && d.reset !== 'reconexion'
          ? `${nombre} se conectó (${(MOTIVOS_REINICIO[d.reset] || d.reset).toLowerCase()})`
          : `${nombre} se conectó`,
      }
    case 'carga':
      return { nivel: 'info', texto: d.carga === 'activa' ? `${nombre}: aparato encendido` : `${nombre}: sin carga` }
    case 'backfill':
      return { nivel: 'info', texto: `${nombre}: ${d.cantidad} lecturas recuperadas tras una caída de red` }
    case 'evento':
      if (d.tipo === 'posible_corte_energia') return { nivel: 'critico', texto: 'Posible corte de energía: todos los nodos se desconectaron' }
      if (d.tipo === 'restablecimiento_energia') {
        return {
          nivel: 'aviso',
          texto: `Energía restablecida${d.duracion_s ? ` tras ${fmtDuracion(d.duracion_s)} sin servicio` : ''}`,
        }
      }
      if (d.tipo === 'inicio_backend') return { nivel: 'info', texto: 'Servidor iniciado' }
      return { nivel: 'info', texto: d.descripcion || d.tipo }
    default:
      return { nivel: 'info', texto: entrada.tipo }
  }
}

export default function Registros({ paquetes = [], bitacora = [], nodos = [] }) {
  const [mostrarCrudo, setMostrarCrudo] = useState(false)
  const nombres = Object.fromEntries(nodos.map((n) => [n.id, n.nombre]))
  const nombreDe = (id) => nombres[id] || nombrePorDefecto(id)

  return (
    <div className="space-y-6">
      {/* Eventos del sistema */}
      <Tarjeta titulo="Eventos del sistema" descripcion="Conexiones, cambios de carga, cortes de energía y datos recuperados." relleno="p-0" className="overflow-hidden [&>header]:px-5 [&>header]:pt-5 [&>header]:mb-3">
        <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
          {bitacora.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-500">Sin eventos registrados todavía.</p>
          ) : (
            bitacora.map((e) => {
              const { nivel, texto } = describir(e, nombreDe)
              return (
                <div key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-[13px] hover:bg-slate-50">
                  <span className="text-slate-500 num whitespace-nowrap w-36 flex-shrink-0">{fmtFechaHora(e.t)}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${NIVELES[nivel]}`}></span>
                  <span className="text-slate-800">{texto}</span>
                </div>
              )
            })
          )}
        </div>
      </Tarjeta>

      {/* Lecturas recibidas */}
      <Tarjeta titulo="Lecturas recibidas" descripcion="Telemetría que llegó desde que abriste esta página." relleno="p-0" className="overflow-hidden [&>header]:px-5 [&>header]:pt-5 [&>header]:mb-3">
        <div className="max-h-[380px] overflow-auto border-t border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 text-[13px] text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-2.5 px-5 font-medium">Fecha y hora</th>
                <th className="py-2.5 px-4 font-medium">Nodo</th>
                <th className="py-2.5 px-4 font-medium text-right">Voltaje</th>
                <th className="py-2.5 px-4 font-medium text-right">Corriente</th>
                <th className="py-2.5 px-5 font-medium text-right">Potencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[13px] num text-slate-800">
              {paquetes.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-slate-500">
                    Esperando lecturas (solo llegan cuando un nodo tiene un aparato encendido)...
                  </td>
                </tr>
              ) : (
                paquetes.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2 px-5 text-slate-500 whitespace-nowrap">{fmtFechaHora(Date.parse(p.timestamp))}</td>
                    <td className="py-2 px-4 font-medium whitespace-nowrap">{nombreDe(p.nodo)}</td>
                    <td className="py-2 px-4 text-right">{fmtNumero(p.voltaje, 1)} V</td>
                    <td className="py-2 px-4 text-right">{fmtNumero(p.corriente, 3)} A</td>
                    <td className="py-2 px-5 text-right font-semibold">{fmtNumero(p.potencia, 1)} W</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {/* Consola cruda */}
      <div>
        <button
          onClick={() => setMostrarCrudo(!mostrarCrudo)}
          aria-expanded={mostrarCrudo}
          className="text-[13px] font-medium text-primario-700 hover:underline"
        >
          {mostrarCrudo ? 'Ocultar los mensajes JSON' : 'Ver los mensajes JSON tal como llegan'}
        </button>
      </div>

      {mostrarCrudo && (
        <div className="bg-tinta text-slate-200 p-4 rounded-2xl text-xs font-mono max-h-60 overflow-y-auto space-y-1">
          {paquetes.length === 0 ? (
            <p className="text-slate-400">Todavía no ha llegado ningún mensaje.</p>
          ) : (
            paquetes.map(({ id, ...paquete }) => (
              <div key={id} className="hover:bg-gray-800/50 p-1 rounded break-all">
                <span className="text-gray-500">[{id}]</span> {JSON.stringify(paquete)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
