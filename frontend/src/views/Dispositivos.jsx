import DeviceDetailPanel from '../components/DeviceDetailPanel.jsx'
import NodeCard from '../components/NodeCard.jsx'
import { estaEnLinea } from '../lib/nodos.js'

export default function Dispositivos({
  nodos = [], series = {}, ahora, nodoSeleccionado, setNodoSeleccionado, onConfigurarNodo, conectado,
}) {
  const nodoActivo = nodos.find((n) => n.id === nodoSeleccionado)
  const enLinea = nodos.filter(estaEnLinea).length

  return (
    <div className="relative flex gap-6 items-start">
      <div className="flex-1 space-y-6 min-w-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gestiona los puntos de conexión</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {nodos.length} {nodos.length === 1 ? 'dispositivo registrado' : 'dispositivos registrados'} · {enLinea} en línea ahora
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {nodos.length === 0 ? (
            <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200/60 text-center">
              <p className="text-sm text-slate-500">
                {conectado ? 'Ningún nodo ha reportado datos todavía.' : 'Sin conexión con el servidor.'}
              </p>
            </div>
          ) : (
            nodos.map((n) => (
              <NodeCard
                key={n.id}
                nodo={n}
                variante="completo"
                seleccionado={nodoSeleccionado === n.id}
                onClick={() => setNodoSeleccionado(n.id)}
              />
            ))
          )}
        </div>
      </div>

      {nodoActivo && (
        <DeviceDetailPanel
          nodo={nodoActivo}
          series={series}
          ahora={ahora}
          onCerrar={() => setNodoSeleccionado(null)}
          onConfigurar={onConfigurarNodo}
        />
      )}
    </div>
  )
}
