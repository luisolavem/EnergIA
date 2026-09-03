import { useEffect, useRef, useState } from 'react'
import NodeCard from './components/NodeCard.jsx'
import EnergyChart from './components/EnergyChart.jsx'

const WS_URL = 'ws://192.168.1.28:8000/ws/nodes' // Ajusta a la IP de tu Raspberry
const MAX_HISTORY_POINTS = 20

export default function App() {
  const [nodes, setNodes] = useState({}) 
  const [history, setHistory] = useState([]) 
  const [rawLogs, setRawLogs] = useState([]) 
  const [connected, setConnected] = useState(false)
  const [activeView, setActiveView] = useState('dashboard') 
  
  // Filtros para la gráfica
  const [chartMetric, setChartMetric] = useState('potencia')
  const [chartNode, setChartNode] = useState('todos')

  const wsRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!cancelled) setTimeout(connect, 2000) 
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'snapshot') {
          const snapshot = {}
          msg.data.forEach((reading) => { snapshot[reading.nodo] = reading })
          setNodes(snapshot)
        }
        if (msg.type === 'update') {
          const reading = msg.data
          setNodes((prev) => ({ ...prev, [reading.nodo]: reading }))
          setRawLogs((prev) => [reading, ...prev].slice(0, 200)) // Guarda últimos 200 logs
          setHistory((prev) => appendReading(prev, reading))
        }
      }
    }
    connect()
    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [])

  const nodeList = Object.values(nodes).sort((a, b) => a.nodo.localeCompare(b.nodo))
  const totalPower = nodeList.reduce((sum, n) => sum + n.potencia, 0)
  const activeNodes = nodeList.filter(n => n.potencia > 0).length

  const renderContent = () => {
    if (activeView === 'dashboard') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-200/60 p-5 rounded-2xl border border-slate-300 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-1">Potencia Total</p>
              <p className="text-3xl font-bold text-slate-800">{totalPower.toFixed(1)} <span className="text-lg font-normal text-slate-500">W</span></p>
            </div>
            <div className="bg-slate-200/60 p-5 rounded-2xl border border-slate-300 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-1">Nodos Activos</p>
              <p className="text-3xl font-bold text-slate-800">{activeNodes} <span className="text-lg font-normal text-slate-500">/ 5</span></p>
            </div>
            <div className="bg-slate-200/60 p-5 rounded-2xl border border-slate-300 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-1">Estado de Red</p>
              <p className="text-xl font-semibold text-emerald-600 mt-2">Estable</p>
            </div>
          </section>

          <section className="bg-slate-200/60 border border-slate-300 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4">
              <h2 className="text-md font-semibold text-slate-700">Consumo Energético en Vivo</h2>
              
              {/* Controles de Filtro */}
              <div className="flex gap-2 text-sm">
                <select 
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700 shadow-sm"
                  value={chartMetric} 
                  onChange={(e) => setChartMetric(e.target.value)}
                >
                  <option value="potencia">Potencia (W)</option>
                  <option value="voltaje">Voltaje (V)</option>
                  <option value="corriente">Corriente (A)</option>
                </select>
                
                <select 
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700 shadow-sm"
                  value={chartNode} 
                  onChange={(e) => setChartNode(e.target.value)}
                >
                  <option value="todos">Todos los Nodos</option>
                  {nodeList.map(n => (
                    <option key={n.nodo} value={n.nodo}>{n.nodo.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <EnergyChart 
              history={history} 
              nodeIds={nodeList.map((n) => n.nodo)} 
              chartMetric={chartMetric}
              chartNode={chartNode}
            />
          </section>
        </div>
      )
    }

    if (activeView === 'dispositivos') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <h2 className="text-xl font-semibold text-slate-700">Gestión de Nodos</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {nodeList.map((node) => (
              <NodeCard key={node.nodo} node={node} />
            ))}
            {nodeList.length === 0 && <p className="text-slate-500">No hay nodos conectados aún.</p>}
          </div>
        </div>
      )
    }

    if (activeView === 'logs') {
      const downloadCSV = () => {
        const headers = "Fecha,Hora,Nodo,Voltaje(V),Corriente(A),Potencia(W)\n"
        const rows = rawLogs.map(r => {
          const d = new Date(r.timestamp)
          return `${d.toLocaleDateString()},${d.toLocaleTimeString()},${r.nodo},${r.voltaje},${r.corriente},${r.potencia}`
        }).join("\n")
        const blob = new Blob([headers + rows], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'telemetria_nodos.csv'; a.click()
      }

      return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-700">Registro de Datos (Logs)</h2>
            <button 
              onClick={downloadCSV} 
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium shadow-sm hover:bg-emerald-700 transition-colors">
              Descargar CSV
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-300 p-4 h-[60vh] overflow-auto font-mono text-sm">
            {rawLogs.length === 0 ? <p className="text-slate-400">Esperando datos...</p> : 
              rawLogs.map((log, i) => (
                <div key={i} className="border-b border-slate-100 py-2.5 text-slate-600 hover:bg-slate-50 px-2 rounded">
                  <span className="text-slate-400">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span className="font-bold text-blue-600">{log.nodo}</span> —{' '}
                  Voltaje: <span className="text-slate-800">{log.voltaje}V</span> |{' '}
                  Corriente: <span className="text-slate-800">{log.corriente}A</span> |{' '}
                  Potencia: <span className="text-slate-800">{log.potencia}W</span>
                </div>
              ))}
          </div>
        </div>
      )
    }

    if (activeView === 'alertas') {
      // Filtramos los nodos que el backend haya marcado como anomalía
      const nodosEnPeligro = nodeList.filter(n => n.anomalia);

      return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <h2 className="text-xl font-semibold text-slate-700">Monitor de IA en Tiempo Real</h2>
          
          {nodosEnPeligro.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[40vh] text-center bg-white rounded-xl border border-slate-300 shadow-sm p-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mb-4">✨</div>
              <h3 className="text-lg font-semibold text-slate-700">Sistema Eléctrico Estable</h3>
              <p className="text-slate-500 max-w-md mt-2">El modelo Isolation Forest está analizando la red. No se detectan cortos circuitos ni consumos inusuales en este momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {nodosEnPeligro.map(nodo => (
                <div key={nodo.nodo} className="bg-red-50 border border-red-300 rounded-xl p-5 shadow-sm flex items-start gap-4">
                  <div className="text-4xl animate-bounce">⚠️</div>
                  <div>
                    <h3 className="text-red-700 font-bold text-lg">Anomalía en {nodo.nodo.toUpperCase()}</h3>
                    <p className="text-red-600 text-sm mt-1">
                      El modelo detectó una desviación severa del patrón normal. Posible corto circuito o sobrecarga.
                      <br/><br/>
                      Voltaje: <b>{nodo.voltaje}V</b> | Corriente: <b>{nodo.corriente}A</b>
                    </p>
                    <p className="text-xs text-red-500 mt-3 font-mono border-t border-red-200 pt-2">
                      Hora de detección: {new Date(nodo.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }}

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800 font-sans">
      <aside className="w-64 bg-slate-200/50 border-r border-slate-300 flex flex-col justify-between hidden md:flex">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-slate-300">
            <span className="font-bold text-xl tracking-tight">Energ<span className="text-blue-600">IA</span></span>
          </div>
          <nav className="p-4 space-y-2">
            <button 
              onClick={() => setActiveView('dashboard')}
              className={`w-full flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${activeView === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-300'}`}>
              Dashboard
            </button>
            <button 
              onClick={() => setActiveView('dispositivos')}
              className={`w-full flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${activeView === 'dispositivos' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-300'}`}>
              Dispositivos
            </button>
            <button 
              onClick={() => setActiveView('logs')}
              className={`w-full flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${activeView === 'logs' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-300'}`}>
              Logs y Datos
            </button>
            <button 
              onClick={() => setActiveView('alertas')}
              className={`w-full flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${activeView === 'alertas' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-300'}`}>
              Alertas (IA)
            </button>
          </nav>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-slate-100 border-b border-slate-300 flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-slate-700 capitalize">{activeView}</h1>
          <div className={`px-3 py-1 rounded-full text-xs font-medium border shadow-sm ${connected ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-red-100 border-red-300 text-red-700'}`}>
            {connected ? '● Sistemas operativos' : '● Reconectando...'}
          </div>
        </header>

        <div className="p-8 overflow-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}

function appendReading(history, reading) {
  const time = new Date(reading.timestamp).toLocaleTimeString()
  const last = history[history.length - 1]
  
  // Aplanamos los datos para que Recharts pueda graficar cualquier métrica de cualquier nodo
  const newData = {
    [`${reading.nodo}_potencia`]: reading.potencia,
    [`${reading.nodo}_voltaje`]: reading.voltaje,
    [`${reading.nodo}_corriente`]: reading.corriente,
  }

  if (last && last.time === time) {
    return [...history.slice(0, -1), { ...last, ...newData }]
  }
  return [...history, { time, ...newData }].slice(-MAX_HISTORY_POINTS)
}