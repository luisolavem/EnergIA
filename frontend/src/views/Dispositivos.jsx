export default function Dispositivos({ nodeList = [], history = [], selectedNodeId, setSelectedNodeId }) {
    const activeNode = nodeList.find((n) => n.nodo === selectedNodeId)

    // Histórico de potencia filtrado para el nodo seleccionado
    const getNodeHistoryPoints = (nodeId) => {
        if (!history.length) return ''
        const values = history.map((h) => h[`${nodeId}_potencia`] || 0)
        const max = Math.max(...values, 10)
        const min = Math.min(...values, 0)
        return values.map((val, idx) => {
            const x = (idx / (values.length - 1 || 1)) * 260
            const y = 80 - ((val - min) / (max - min || 1)) * 60 - 10
            return `${x},${y}`
        }).join(' ')
    }

    return (
        <div className="relative flex gap-6 h-full items-start">
            {/* Grid Principal de Tarjetas Cuadradas */}
            <div className="flex-1 space-y-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Gestiona los puntos de conexión</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {nodeList.length} {nodeList.length === 1 ? 'dispositivo detectado' : 'dispositivos detectados'} · {nodeList.length} online ahora
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {nodeList.length === 0 ? (
                        <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200/60 text-center">
                            <p className="text-sm text-slate-500">No se detectan dispositivos activos en la red.</p>
                        </div>
                    ) : (
                        nodeList.map((node) => (
                            <div
                                key={node.nodo}
                                onClick={() => setSelectedNodeId(node.nodo)}
                                className={`p-4 rounded-2xl border bg-white shadow-sm transition-all cursor-pointer flex flex-col justify-between aspect-square ${selectedNodeId === node.nodo ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-slate-200/80 hover:border-slate-300'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="w-9 h-9 rounded-xl bg-slate-900 text-cyan-400 flex items-center justify-center font-bold text-xs">
                                        ESP
                                    </div>
                                    <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                        Online
                                    </span>
                                </div>

                                <div>
                                    <h3 className="font-bold text-sm text-slate-900">Nodo {node.nodo}</h3>
                                    <p className="text-[10px] text-slate-400">ESP32 Controller</p>
                                </div>

                                <div className="grid grid-cols-3 gap-1 pt-3 border-t border-slate-100 text-center">
                                    <div>
                                        <p className="text-[9px] text-slate-400 font-medium">Potencia</p>
                                        <p className="text-xs font-bold text-slate-800">{node.potencia ?? '--'} W</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-400 font-medium">Voltaje</p>
                                        <p className="text-xs font-bold text-slate-800">{node.voltaje ?? '--'} V</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-400 font-medium">Corriente</p>
                                        <p className="text-xs font-bold text-slate-800">{node.corriente ?? '--'} A</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Panel Lateral Emergente (Detalle del Dispositivo) */}
            {activeNode && (
                <div className="w-80 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xl space-y-5 flex-shrink-0 animate-in slide-in-from-right duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm">Detalle del dispositivo</h3>
                            <p className="text-[10px] text-slate-400">Monitoreo específico e información del backend</p>
                        </div>
                        <button
                            onClick={() => setSelectedNodeId(null)}
                            className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-xs text-slate-500 font-bold"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-bold text-base text-slate-900">Nodo {activeNode.nodo}</h4>
                            <p className="text-xs text-slate-400">ESP32-WROOM-32</p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                            Online
                        </span>
                    </div>

                    {/* Grid de Variables Adicionales (Esperando Backend) */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-medium">Dirección IP</p>
                            <p className="font-bold text-slate-800 mt-0.5">{activeNode.ip || 'Esperando...'}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-medium">Señal WiFi</p>
                            <p className="font-bold text-slate-800 mt-0.5">{activeNode.rssi ? `${activeNode.rssi} dBm` : 'Esperando...'}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-medium">Tiempo en línea</p>
                            <p className="font-bold text-slate-800 mt-0.5">{activeNode.uptime || 'Esperando...'}</p>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-medium">Pico histórico</p>
                            <p className="font-bold text-slate-800 mt-0.5">{activeNode.maxPower ? `${activeNode.maxPower} W` : 'Esperando...'}</p>
                        </div>
                    </div>

                    {/* Gráfico de tendencia local */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-700">Consumo reciente (Potencia)</p>
                        <div className="h-24 w-full bg-slate-50 rounded-xl border border-slate-100 p-2 flex items-center justify-center">
                            {history.length > 1 ? (
                                <svg className="w-full h-full overflow-visible" viewBox="0 0 260 80">
                                    <polyline
                                        fill="none"
                                        stroke="#10b981"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        points={getNodeHistoryPoints(activeNode.nodo)}
                                    />
                                </svg>
                            ) : (
                                <p className="text-[10px] text-slate-400 italic">Capturando historial...</p>
                            )}
                        </div>
                    </div>

                    <button className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-colors shadow-sm">
                        Ver telemetría completa
                    </button>
                </div>
            )}
        </div>
    )
}