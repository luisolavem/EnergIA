export default function NodeCard({ node, onClick }) {
  const isOnline = node.potencia > 0.5

  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Superior: Icono, Nombre y Pill Online */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-cyan-400 rounded-xl flex items-center justify-center font-bold text-xs shadow-inner">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight uppercase">{node.nodo}</h3>
              <p className="text-[11px] text-slate-400">Planta Norte · Línea 1</p>
            </div>
          </div>

          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isOnline ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-900 text-slate-300'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Potencia Actual & Mini Sparkline */}
        <div className="flex items-end justify-between my-2">
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Potencia actual</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tight">
              {isOnline ? node.potencia.toFixed(0) : '--'} <span className="text-xs font-normal text-slate-500">W</span>
            </p>
          </div>

          {/* Mini Sparkline Line graphic */}
          <div className="w-24 h-8 text-cyan-500 flex items-center justify-end">
            <svg className="w-full h-full" viewBox="0 0 100 30" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M 0 25 Q 20 10, 40 20 T 80 5 T 100 15" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer Card */}
      <div className="border-t border-slate-100 pt-3 mt-3 flex items-center justify-between text-[11px] text-slate-400 font-medium">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10 10 0 0114.142 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
          -54 dBm
        </span>
        <span>Uptime 14d 06h</span>
      </div>
    </div>
  )
}