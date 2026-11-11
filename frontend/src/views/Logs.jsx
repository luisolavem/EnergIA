import { useState } from 'react'
import { MOTIVOS_REINICIO, fmtDuracion, fmtFechaHora, fmtNumero } from '../lib/formato.js'
import { nombrePorDefecto } from '../lib/nodos.js'

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
          ? `${nombre} se conectó · ${MOTIVOS_REINICIO[d.reset] || d.reset}`
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

export default function Logs({ paquetes = [], bitacora = [], nodos = [] }) {
  const [mostrarCrudo, setMostrarCrudo] = useState(false)
  const nombres = Object.fromEntries(nodos.map((n) => [n.id, n.nombre]))
  const nombreDe = (id) => nombres[id] || nombrePorDefecto(id)

  return (
    <div className="space-y-6">
      {/* Eventos del sistema */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Eventos del sistema</h3>
          <p className="text-xs text-slate-400">Conexiones, cambios de carga, cortes de energía y recuperación de datos</p>
        </div>
        <div className="max-h-[260px] overflow-y-auto divide-y divide-slate-100">
          {bitacora.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400 italic">Sin eventos registrados todavía.</p>
          ) : (
            bitacora.map((e) => {
              const { nivel, texto } = describir(e, nombreDe)
              return (
                <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-slate-50/80">
                  <span className="text-slate-400 font-mono whitespace-nowrap">{fmtFechaHora(e.t)}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${NIVELES[nivel]}`}></span>
                  <span className="text-slate-700">{texto}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Lecturas recibidas */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Lecturas recibidas</h3>
          <p className="text-xs text-slate-400">Últimos paquetes de telemetría llegados por WebSocket (desde que abriste esta página)</p>
        </div>

        <div className="max-h-[380px] overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4 font-semibold">Fecha y hora</th>
                <th className="py-3 px-4 font-semibold">Nodo</th>
                <th className="py-3 px-4 font-semibold">Voltaje</th>
                <th className="py-3 px-4 font-semibold">Corriente</th>
                <th className="py-3 px-4 font-semibold">Potencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono text-slate-700">
              {paquetes.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-slate-400 font-sans italic">
                    Esperando lecturas (solo llegan cuando un nodo tiene un aparato encendido)...
                  </td>
                </tr>
              ) : (
                paquetes.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">{fmtFechaHora(Date.parse(p.timestamp))}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900 font-sans whitespace-nowrap">{nombreDe(p.nodo)}</td>
                    <td className="py-2.5 px-4">{fmtNumero(p.voltaje, 1)} V</td>
                    <td className="py-2.5 px-4">{fmtNumero(p.corriente, 3)} A</td>
                    <td className="py-2.5 px-4 font-bold text-primario-600">{fmtNumero(p.potencia, 1)} W</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Consola cruda */}
      <div>
        <button
          onClick={() => setMostrarCrudo(!mostrarCrudo)}
          className="text-xs font-bold text-primario-600 hover:text-primario-700 flex items-center gap-1.5 transition-colors"
        >
          <span>{mostrarCrudo ? '▼' : '►'}</span>
          <span>{mostrarCrudo ? 'Ocultar consola raw' : 'Ver consola raw'}</span>
        </button>
      </div>

      {mostrarCrudo && (
        <div className="bg-tinta text-gray-200 p-4 rounded-2xl border border-gray-800 text-xs font-mono max-h-60 overflow-y-auto shadow-inner space-y-1">
          {paquetes.length === 0 ? (
            <p className="text-gray-500 italic">// No hay paquetes JSON registrados aún.</p>
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
