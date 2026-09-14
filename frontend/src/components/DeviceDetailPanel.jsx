export default function DeviceDetailPanel({ node, onClose }) {
    if (!node) return null

    return (
        <>
            {/* Background Backdrop */}
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40" onClick={onClose} />

            {/* Dark Drawer Panel */}
            <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0d1424] text-white shadow-2xl z-50 flex flex-col justify-between p-6 animate-in slide-in-from-right duration-300">
                <div>
                    {/* Header Drawer */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                        <h2 className="text-sm font-semibold text-slate-400">Detalle del dispositivo</h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
                    </div>

                    {/* Device Title & Status */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-2xl font-bold uppercase tracking-tight text-white">{node.nodo}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Planta Norte · Línea 1</p>
                        </div>
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Online
                        </span>
                    </div>

                    {/* Grid Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        <div className="bg-[#141d33] p-4 rounded-xl border border-slate-800">
                            <p className="text-[11px] text-slate-400">Dirección IP</p>
                            <p className="text-sm font-bold text-white mt-1">192.168.1.101</p>
                        </div>
                        <div className="bg-[#141d33] p-4 rounded-xl border border-slate-800">
                            <p className="text-[11px] text-slate-400">Señal WiFi</p>
                            <p className="text-sm font-bold text-white mt-1">-54 dBm</p>
                        </div>
                        <div className="bg-[#141d33] p-4 rounded-xl border border-slate-800">
                            <p className="text-[11px] text-slate-400">Tiempo en línea</p>
                            <p className="text-sm font-bold text-white mt-1">14d 08h</p>
                        </div>
                        <div className="bg-[#141d33] p-4 rounded-xl border border-slate-800">
                            <p className="text-[11px] text-slate-400">Máximo histórico</p>
                            <p className="text-sm font-bold text-white mt-1">1.24 kW</p>
                        </div>
                    </div>

                    {/* Mini Dark Chart Section */}
                    <div className="bg-[#141d33] p-4 rounded-xl border border-slate-800">
                        <p className="text-xs font-semibold text-slate-300 mb-3">Consumo en las últimas 12 horas</p>
                        <div className="h-32 w-full text-emerald-400 flex items-center justify-center">
                            <svg className="w-full h-full" viewBox="0 0 200 60" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M 0 45 Q 40 20, 80 35 T 160 15 T 200 10" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 mt-2">
                            <span>00:00</span>
                            <span>Ahora</span>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <button className="w-full bg-[#00e6a8] hover:bg-[#00c993] text-slate-950 font-bold py-3.5 rounded-xl text-sm transition-colors shadow-lg">
                    Ver telemetría completa
                </button>
            </aside>
        </>
    )
}