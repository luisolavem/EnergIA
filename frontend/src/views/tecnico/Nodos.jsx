// Nodos (técnico): una tarjeta por nodo con sus medidas y el panel de diagnóstico.
import DeviceDetailPanel from '../../components/DeviceDetailPanel.jsx'
import NodeCard from '../../components/NodeCard.jsx'
import { Vacio } from '../../components/ui.jsx'
import { estaEnLinea } from '../../lib/nodos.js'

export default function Nodos({
  nodos = [], series = {}, ahora, nodoSeleccionado, setNodoSeleccionado, onConfigurarNodo, conectado,
}) {
  const nodoActivo = nodos.find((n) => n.id === nodoSeleccionado)
  const enLinea = nodos.filter(estaEnLinea).length

  return (
    <div className="relative flex gap-5 items-start">
      <div className="flex-1 space-y-4 min-w-0">
        <p className="text-sm text-slate-500 num">
          {nodos.length} {nodos.length === 1 ? 'nodo registrado' : 'nodos registrados'}, {enLinea} en línea.
        </p>
        {nodos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/70">
            <Vacio>{conectado ? 'Ningún nodo ha reportado datos todavía.' : 'Sin conexión con el servidor.'}</Vacio>
          </div>
        ) : (
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${nodoActivo ? '2xl:grid-cols-3' : 'xl:grid-cols-3'}`}>
            {nodos.map((n) => (
              <NodeCard
                key={n.id}
                nodo={n}
                variante="completo"
                seleccionado={nodoSeleccionado === n.id}
                onClick={() => setNodoSeleccionado(n.id)}
              />
            ))}
          </div>
        )}
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
