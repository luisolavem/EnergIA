import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'

const DATA = [
    { name: 'Producción', value: 42, color: '#00d2b5' },
    { name: 'Climatización', value: 29, color: '#e2e8f0' },
    { name: 'Compresión', value: 17, color: '#f59e0b' },
    { name: 'Otros', value: 12, color: '#0f172a' },
]

export default function DonutChart() {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="w-1/2 h-44 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={DATA}
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={4}
                            dataKey="value"
                        >
                            {DATA.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold text-slate-800">1.87</span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">kW total</span>
                </div>
            </div>

            <div className="w-1/2 space-y-2">
                {DATA.map((item) => (
                    <div key={item.name} className="flex items-center justify-between text-xs font-medium">
                        <span className="flex items-center gap-2 text-slate-600">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                            {item.name}
                        </span>
                        <span className="font-bold text-slate-800">{item.value}%</span>
                    </div>
                ))}
            </div>
        </div>
    )
}