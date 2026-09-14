export default function Alertas() {
    return (
        <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200/60 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="font-bold text-slate-800 text-base">Sin alertas activas</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    El sistema no reporta anomalías ni eventos críticos en este momento.
                </p>
            </div>
        </div>
    )
}