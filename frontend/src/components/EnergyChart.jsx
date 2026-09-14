import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const COLORS = ['#00e6a8', '#38bdf8', '#fbbf24', '#f87171']

export default function EnergyChart({ history, nodeIds }) {
  if (!history || history.length === 0) {
    return (
      <div className="h-[320px] bg-[#0b1120] rounded-2xl flex items-center justify-center text-slate-500 text-sm border border-slate-800">
        Esperando telemetría en vivo...
      </div>
    )
  }

  return (
    <div className="bg-[#0b1120] rounded-2xl p-6 border border-slate-800 shadow-xl">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', color: '#fff' }}
            itemStyle={{ fontSize: '12px' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
          {nodeIds.map((id, i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={`${id}_potencia`}
              name={id.toUpperCase()}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}