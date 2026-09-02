export default function NodeCard({ node }) {
  const isOnline = node.potencia > 0.5; 

  return (
    <div className={`bg-slate-200/60 border rounded-2xl p-5 shadow-sm transition-all duration-300 ${
      isOnline ? 'border-blue-300 hover:border-blue-500' : 'border-slate-300 opacity-60 grayscale'
    }`}>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{node.nodo}</p>
        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isOnline ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-500 border border-slate-300'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      
      <p className={`text-2xl font-bold mb-3 ${isOnline ? 'text-slate-800' : 'text-slate-400'}`}>
        {isOnline ? node.potencia.toFixed(1) : '--'} <span className="text-sm font-normal">W</span>
      </p>
      
      <div className="space-y-1 text-xs text-slate-600 border-t border-slate-300 pt-3 mt-auto">
        <div className="flex justify-between">
          <span>Voltaje:</span>
          <span className="font-medium text-slate-800">{isOnline ? `${node.voltaje.toFixed(1)} V` : '--'}</span>
        </div>
        <div className="flex justify-between">
          <span>Corriente:</span>
          <span className="font-medium text-slate-800">{isOnline ? `${node.corriente.toFixed(2)} A` : '--'}</span>
        </div>
      </div>
    </div>
  )
}