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

const COLORS = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

export default function EnergyChart({ history, nodeIds }) {
  if (history.length === 0) {
    return <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">Esperando datos...</div>
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        {/* Cambiamos el color de la cuadrícula a un gris claro[cite: 4] */}
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="time" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#9ca3af"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          label={{ value: 'W', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          labelStyle={{ color: '#4b5563', fontWeight: 600, marginBottom: 4 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#4b5563', paddingTop: '20px' }} />
        {nodeIds.map((id, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={id}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={3}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}