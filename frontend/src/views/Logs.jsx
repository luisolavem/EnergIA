import { useState } from 'react'

export default function Logs({ rawLogs = [] }) {
    const [showRaw, setShowRaw] = useState(false)

    return (
        <div className="space-y-4 flex flex-col h-full">
            {/* Contenedor Principal de la Tabla */}
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm">Registros del Sistema (Logs)</h3>
                    <p className="text-xs text-slate-400">Captura de paquetes recibidos desde el WebSocket</p>
                </div>

                {/* Tabla Scrollable Internamente */}
                <div className="max-h-[380px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            <tr>
                                <th className="py-3 px-4 font-semibold">Timestamp</th>
                                <th className="py-3 px-4 font-semibold">Nodo</th>
                                <th className="py-3 px-4 font-semibold">Voltaje</th>
                                <th className="py-3 px-4 font-semibold">Corriente</th>
                                <th className="py-3 px-4 font-semibold">Potencia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-mono text-slate-700">
                            {rawLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="py-6 text-center text-slate-400 font-sans italic">
                                        Esperando datos del servidor...
                                    </td>
                                </tr>
                            ) : (
                                rawLogs.map((log, index) => (
                                    <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="py-2.5 px-4 text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '--'}</td>
                                        <td className="py-2.5 px-4 font-bold text-slate-900">{log.nodo}</td>
                                        <td className="py-2.5 px-4">{log.voltaje} V</td>
                                        <td className="py-2.5 px-4">{log.corriente} A</td>
                                        <td className="py-2.5 px-4 font-bold text-cyan-600">{log.potencia} W</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Botón Fijo Consola Raw */}
            <div>
                <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="text-xs font-bold text-cyan-600 hover:text-cyan-700 flex items-center gap-1.5 transition-colors"
                >
                    <span>{showRaw ? '▼' : '►'}</span>
                    <span>{showRaw ? 'Ocultar consola raw' : 'Ver consola raw'}</span>
                </button>
            </div>

            {/* Caja de Consola Raw con Scroll Interno Independiente */}
            {showRaw && (
                <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl border border-slate-800 text-xs font-mono max-h-60 overflow-y-auto shadow-inner space-y-1">
                    {rawLogs.length === 0 ? (
                        <p className="text-slate-500 italic">// No hay paquetes JSON registrados aún.</p>
                    ) : (
                        rawLogs.map((log, idx) => (
                            <div key={idx} className="hover:bg-slate-800/50 p-1 rounded">
                                <span className="text-slate-500">[{idx}]</span> {JSON.stringify(log)}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}