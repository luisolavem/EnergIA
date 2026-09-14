import { useState } from 'react'

export default function ConfiguracionModal({ isOpen, onClose, wsUrl, setWsUrl, kwhRate, setKwhRate, theme, setTheme }) {
    const [activeTab, setActiveTab] = useState('red')

    // Opciones de temas para la interfaz
    const themes = [
        { id: 'cyan', name: 'Esmeralda & Cían', primary: 'bg-cyan-500', accent: 'bg-emerald-500', desc: 'Tema predeterminado limpio' },
        { id: 'indigo', name: 'Índigo Tech', primary: 'bg-indigo-600', accent: 'bg-violet-500', desc: 'Tonalidades violetas y profesionales' },
        { id: 'amber', name: 'Ámbar Cálido', primary: 'bg-amber-500', accent: 'bg-orange-500', desc: 'Alto contraste con tonos cálidos' },
        { id: 'dark', name: 'Modo Oscuro / Neón', primary: 'bg-slate-900', accent: 'bg-cyan-400', desc: 'Fondo oscuro con acentos neón' },
    ]

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            {/* Container Principal del Modal */}
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Cabecera Modal */}
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h2 className="font-bold text-slate-900 text-lg">Configuración del Sistema</h2>
                        <p className="text-xs text-slate-400">Ajusta parámetros de red, alertas y apariencia visual</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors text-sm font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* Menú de Navegación Pestañas */}
                <div className="flex border-b border-slate-100 bg-slate-50/30 px-6 pt-2 gap-4 text-xs font-semibold">
                    <button
                        onClick={() => setActiveTab('red')}
                        className={`pb-3 border-b-2 transition-colors ${activeTab === 'red' ? 'border-cyan-500 text-cyan-600 font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Red & Costos
                    </button>
                    <button
                        onClick={() => setActiveTab('alertas')}
                        className={`pb-3 border-b-2 transition-colors ${activeTab === 'alertas' ? 'border-cyan-500 text-cyan-600 font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Nodos & Umbrales
                    </button>
                    <button
                        onClick={() => setActiveTab('apariencia')}
                        className={`pb-3 border-b-2 transition-colors ${activeTab === 'apariencia' ? 'border-cyan-500 text-cyan-600 font-bold' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Apariencia & Tema
                    </button>
                </div>

                {/* Contenido Dinámico por Pestaña */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700">

                    {/* TAB 1: Red y Costos */}
                    {activeTab === 'red' && (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Servidor WebSocket Backend</label>
                                <input
                                    type="text"
                                    value={wsUrl}
                                    onChange={(e) => setWsUrl(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                                    placeholder="ws://192.168.1.28:8000/ws/nodes"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Dirección IP y puerto donde corre el servicio FastAPI / Node.js.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tarifa kWh ($)</label>
                                    <input
                                        type="number"
                                        value={kwhRate}
                                        onChange={(e) => setKwhRate(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                                        placeholder="850"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-1">Costo por kilovatio-hora para proyecciones financieras.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Moneda Local</label>
                                    <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all">
                                        <option value="COP">COP ($ - Peso Colombiano)</option>
                                        <option value="USD">USD ($ - Dólar)</option>
                                        <option value="EUR">EUR (€ - Euro)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Nodos y Umbrales de Alerta */}
                    {activeTab === 'alertas' && (
                        <div className="space-y-5">
                            <p className="text-xs text-slate-500">Define los valores límite para que el backend dispare notificaciones cuando un parámetro se exceda.</p>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Voltaje Mínimo (V)</label>
                                    <input
                                        type="number"
                                        defaultValue={105}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Voltaje Máximo (V)</label>
                                    <input
                                        type="number"
                                        defaultValue={135}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Potencia Máxima por Nodo (W)</label>
                                <input
                                    type="number"
                                    defaultValue={2500}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Límite recomendado de sobrecarga antes de notificar.</p>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Apariencia y Selector de Temas */}
                    {activeTab === 'apariencia' && (
                        <div className="space-y-4">
                            <p className="text-xs text-slate-500">Elige la combinación cromática que mejor se adapte a tu monitor o preferencia visual:</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {themes.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id)}
                                        className={`p-4 rounded-2xl border text-left flex items-start justify-between transition-all ${theme === t.id ? 'border-cyan-500 bg-cyan-50/30 ring-2 ring-cyan-500/20' : 'border-slate-200/80 bg-white hover:border-slate-300'}`}
                                    >
                                        <div>
                                            <h4 className="font-bold text-xs text-slate-800">{t.name}</h4>
                                            <p className="text-[10px] text-slate-400 mt-1">{t.desc}</p>
                                        </div>
                                        <div className="flex gap-1.5 items-center">
                                            <span className={`w-3.5 h-3.5 rounded-full ${t.primary}`}></span>
                                            <span className={`w-3.5 h-3.5 rounded-full ${t.accent}`}></span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Modal con Acción de Guardar */}
                <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/60 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-400 text-slate-900 hover:bg-cyan-300 transition-colors shadow-sm"
                    >
                        Guardar Cambios
                    </button>
                </div>

            </div>
        </div>
    )
}