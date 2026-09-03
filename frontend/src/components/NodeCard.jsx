export default function NodeCard({ node }) {
  const isOnline = node.potencia > 0.5; 
  const isAnomaly = node.anomalia;

  // Definir los colores según el estado
  let cardStyle = isOnline ? 'border-blue-300 hover:border-blue-500 bg-slate-200/60' : 'border-slate-300 opacity-60 grayscale bg-slate-200/60';
  if (isAnomaly) cardStyle = 'border-red-500 bg-red-50 shadow-red-200 shadow-md animate-pulse';

  return (
    <div className={`border rounded-2xl p-5 transition-all duration-300 ${cardStyle}`}>
      <div className="flex justify-between items-center mb-3">
        <p className={`text-xs font-semibold uppercase tracking-wider ${isAnomaly ? 'text-red-700' : 'text-slate-600'}`}>
          {node.nodo}
        </p>
        
        {isAnomaly ? (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">
            ⚠️ PELIGRO
          </span>
        ) : (
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isOnline ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-500 border border-slate-300'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        )}
      </div>
      
      <p className={`text-2xl font-bold mb-3 ${isAnomaly ? 'text-red-600' : isOnline ? 'text-slate-800' : 'text-slate-400'}`}>
        {isOnline ? node.potencia.toFixed(1) : '--'} <span className="text-sm font-normal">W</span>
      </p>
      
      <div className={`space-y-1 text-xs border-t pt-3 mt-auto ${isAnomaly ? 'border-red-200 text-red-800' : 'border-slate-300 text-slate-600'}`}>
        <div className="flex justify-between">
          <span>Voltaje:</span>
          <span className="font-medium">{isOnline ? `${node.voltaje.toFixed(1)} V` : '--'}</span>
        </div>
        <div className="flex justify-between">
          <span>Corriente:</span>
          <span className="font-medium">{isOnline ? `${node.corriente.toFixed(2)} A` : '--'}</span>
        </div>
      </div>
    </div>
  )
}