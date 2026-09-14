import { useState } from 'react'

export default function Dashboard({ nodeList = [], history = [], onSelectNode }) {
    const [filterNode, setFilterNode] = useState('all')
    const [selectedMetric, setSelectedMetric] = useState('potencia')

    // Nodos a considerar según el filtro
    const filteredNodes = filterNode === 'all'
        ? nodeList
        : nodeList.filter((n) => n.nodo === filterNode)

    const totalPowerKW = (filteredNodes.reduce((acc, n) => acc + (n.potencia || 0), 0) / 1000).toFixed(2)
    const avgVoltage = filteredNodes.length > 0
        ? (filteredNodes.reduce((acc, n) => acc + (n.voltaje || 0), 0) / filteredNodes.length).toFixed(1)
        : '0.0'

    const totalWatts = nodeList.reduce((acc, n) => acc + (n.potencia || 0), 0)

    // Generador de puntos para la gráfica de líneas en SVG
    const getChartPoints = () => {
        if (!history.length) return ''
        const width = 600
        const height = 180
        const values = history.map((h) => {
            if (filterNode === 'all') {
                return nodeList.reduce((acc, n) => acc + (h[`${n.nodo}_${selectedMetric}`] || 0), 0)
            }
            return h[`${filterNode}_${selectedMetric}`] || 0
        })

        const max = Math.max(...values, 10)
        const min = Math.min(...values, 0)

        return values.map((val, idx) => {
            const x = (idx / (values.length - 1 || 1)) * width
            const y = height - ((val - min) / (max - min || 1)) * (height - 20) - 10
            return `${x},${y}`
        }).join(' ')
    }

    // Paleta de colores para el gráfico de dona
    const colors = ['#06b6d4', '#10b981', '#6366f1', '#f59e0b', '#ec4899']

    return (
        <div className="space-y-6">
            {/* Barra de Filtros Superior */}
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                <div>
                    <h2 className="text-sm font-bold text-slate-800">Filtrar vista global</h2>
                    <p className="text-xs text-slate-400">Selecciona un nodo específico para aislar las métricas</p>
                </div>
                <select
                    value={filterNode}
                    onChange={(e) => setFilterNode(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                >
                    <option value="all">Todos los nodos ({nodeList.length})</option>
                    {nodeList.map((n) => (
                        <option key={n.nodo} value={n.nodo}>Nodo {n.nodo}</option>
                    ))}
                </select>
            </div>

            {/* Tarjetas KPI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Consumo total</p>
                        <h2 className="text-2xl font-bold text-slate-900 mt-1">{totalPowerKW} <span className="text-sm font-normal text-slate-500">kW</span></h2>
                        <p className="text-xs text-slate-400 mt-2">-- vs. período anterior</p>
                    </div>
                    <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-cyan-400">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" /></svg>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Voltaje promedio</p>
                        <h2 className="text-2xl font-bold text-slate-900 mt-1">{avgVoltage} <span className="text-sm font-normal text-slate-500">V</span></h2>
                        <p className="text-xs text-slate-400 mt-2">-- vs. promedio esperado</p>
                    </div>
                    <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-cyan-400">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" /></svg>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400 font-medium">Nodos activos</p>
                        <h2 className="text-2xl font-bold text-slate-900 mt-1">{filteredNodes.length} <span className="text-sm font-normal text-slate-500">activos</span></h2>
                        <p className="text-xs text-slate-400 mt-2">Puntos de medición en línea</p>
                    </div>
                    <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-cyan-400">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" /></svg>
                    </div>
                </div>
            </div>

            {/* Gráfica de Líneas + Distribución Circular */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico Temporal */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-bold text-slate-900 text-sm">Comportamiento en tiempo real</h3>
                            <p className="text-xs text-slate-400">Lecturas de telemetría continuas</p>
                        </div>
                        {/* Desplegable para cambiar métrica */}
                        <select
                            value={selectedMetric}
                            onChange={(e) => setSelectedMetric(e.target.value)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                        >
                            <option value="potencia">Potencia (W)</option>
                            <option value="voltaje">Voltaje (V)</option>
                            <option value="corriente">Corriente (A)</option>
                        </select>
                    </div>

                    <div className="h-48 w-full relative flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 p-2">
                        {history.length > 1 ? (
                            <svg className="w-full h-full overflow-visible" viewBox="0 0 600 180">
                                <polyline
                                    fill="none"
                                    stroke="#06b6d4"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={getChartPoints()}
                                />
                            </svg>
                        ) : (
                            <p className="text-xs text-slate-400 italic">Esperando historial de datos...</p>
                        )}
                    </div>
                </div>

                {/* Gráfico de Dona (Distribución) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Distribución por nodo</h3>
                        <p className="text-xs text-slate-400 mb-4">Proporción de consumo actual</p>
                    </div>

                    <div className="flex flex-col items-center justify-center py-2">
                        <div className="relative w-36 h-36 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                <path
                                    className="text-slate-100"
                                    strokeWidth="4"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                {nodeList.map((node, idx) => {
                                    const percentage = totalWatts > 0 ? Math.round(((node.potencia || 0) / totalWatts) * 100) : 0
                                    const offset = nodeList.slice(0, idx).reduce((acc, n) => acc + (totalWatts > 0 ? ((n.potencia || 0) / totalWatts) * 100 : 0), 0)
                                    return (
                                        <circle
                                            key={node.nodo}
                                            stroke={colors[idx % colors.length]}
                                            strokeWidth="4"
                                            strokeDasharray={`${percentage}, 100`}
                                            strokeDashoffset={`-${offset}`}
                                            strokeLinecap="round"
                                            fill="none"
                                            cx="18"
                                            cy="18"
                                            r="15.9155"
                                        />
                                    )
                                })}
                            </svg>
                            <div className="absolute text-center">
                                <span className="text-base font-bold text-slate-800">{totalPowerKW}</span>
                                <p className="text-[9px] text-slate-400 uppercase font-semibold">kW Total</p>
                            </div>
                        </div>

                        {/* Leyendas */}
                        <div className="w-full space-y-1.5 mt-4">
                            {nodeList.map((node, idx) => {
                                const percentage = totalWatts > 0 ? Math.round(((node.potencia || 0) / totalWatts) * 100) : 0
                                return (
                                    <div key={node.nodo} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                                            <span className="text-slate-600 font-medium">Nodo {node.nodo}</span>
                                        </div>
                                        <span className="font-bold text-slate-800">{percentage}%</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Estado de Dispositivos (Tarjetas inspiradas en el diseño oscuro pero adaptadas) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Estado de dispositivos</h3>
                        <p className="text-xs text-slate-400">Haz clic en una tarjeta para ver su telemetría en detalle</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {nodeList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4 col-span-full text-center">No hay nodos conectados.</p>
                    ) : (
                        nodeList.map((node) => (
                            <div
                                key={node.nodo}
                                onClick={() => onSelectNode(node.nodo)}
                                className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-cyan-500 hover:shadow-md transition-all cursor-pointer space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-cyan-400 flex items-center justify-center font-bold text-xs">
                                        ⚡
                                    </div>
                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Online
                                    </span>
                                </div>

                                <div>
                                    <h4 className="font-bold text-sm text-slate-800">Nodo {node.nodo}</h4>
                                    <p className="text-[10px] text-slate-400">ESP32 Energy Sensor</p>
                                </div>

                                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-900">{node.potencia || 0} W</span>
                                    <span className="text-[10px] text-cyan-600 font-semibold hover:underline">Ver detalle →</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}