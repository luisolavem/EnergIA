import { useEffect, useRef, useState } from 'react'
import NodeCard from './components/NodeCard.jsx'
import EnergyChart from './components/EnergyChart.jsx'

const WS_URL = 'ws://192.168.1.28:8000/ws/nodes'
const MAX_HISTORY_POINTS = 20

export default function App() {
  const [nodes, setNodes] = useState({}) 
  const [history, setHistory] = useState([]) 
  const [connected, setConnected] = useState(false)
  
  // NUEVO: Estado para saber qué menú está activo
  const [activeView, setActiveView] = useState('dashboard') 
  
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
          msg.data.forEach((reading) => { snapshot[reading.node_id] = reading })
          setNodes(snapshot)
        }
        if (msg.type === 'update') {
          const reading = msg.data
          setNodes((prev) => ({ ...prev, [reading.node_id]: reading }))
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

  // NUEVO: Función que decide qué contenido mostrar
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
            <h2 className="text-md font-semibold text-slate-700 mb-6">Consumo Energético en Vivo</h2>
            <EnergyChart history={history} nodeIds={nodeList.map((n) => n.nodo)} />
          </section>
        </div>
      )
    }

    if (activeView === 'dispositivos') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500">
          <h2 className="text-xl font-semibold text-slate-700">Gestión de Nodos</h2>
          <p className="text-slate-500">Monitor individual de los sensores instalados en la residencia.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {nodeList.map((node) => (
              <NodeCard key={node.node_id} node={node} />
            ))}
            {nodeList.length === 0 && <p className="text-slate-500">No hay nodos conectados aún.</p>}
          </div>
        </div>
      )
    }

    if (activeView === 'alertas') {
      return (
        <div className="space-y-6 animate-in fade-in duration-500 flex flex-col items-center justify-center h-[60vh] text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl mb-4">🤖</div>
          <h2 className="text-2xl font-semibold text-slate-700">Módulo de Inteligencia Artificial</h2>
          <p className="text-slate-500 max-w-md">Aquí mostraremos las sugerencias de ahorro y la detección de cortos circuitos una vez que el modelo esté entrenado y conectado.</p>
        </div>
      )
    }
  }

  // Cambio de colores: bg-slate-100 es un gris muy clarito y elegante
  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800 font-sans">
      
      {/* Menú Lateral (Sidebar) con botones funcionales */}
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
              onClick={() => setActiveView('alertas')}
              className={`w-full flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${activeView === 'alertas' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-300'}`}>
              Alertas (IA)
            </button>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-300 text-sm text-slate-500 font-medium">
          Popayán - Proyecto Base
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col">
        <header className="h-16 bg-slate-100 border-b border-slate-300 flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-slate-700 capitalize">{activeView}</h1>
          <div className={`px-3 py-1 rounded-full text-xs font-medium border shadow-sm ${connected ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-red-100 border-red-300 text-red-700'}`}>
            {connected ? '● Sistemas operativos' : '● Reconectando...'}
          </div>
        </header>

        <div className="p-8 overflow-auto">
          {/* Aquí se inyecta la vista seleccionada */}
          {renderContent()}
        </div>
      </main>
    </div>
  )
}

function appendReading(history, reading) {
  const time = new Date(reading.timestamp).toLocaleTimeString()
  const last = history[history.length - 1]
  if (last && last.time === time) {
    const updatedPoint = { ...last, [reading.nodo]: reading.potencia }
    return [...history.slice(0, -1), updatedPoint]
  }
  const newPoint = { time, [reading.nodo]: reading.potencia }
  return [...history, newPoint].slice(-MAX_HISTORY_POINTS)
}