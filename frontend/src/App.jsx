import { useEffect, useRef, useState } from 'react'
import Dashboard from './views/Dashboard.jsx'
import Dispositivos from './views/Dispositivos.jsx'
import Alertas from './views/Alertas.jsx'
import Logs from './views/Logs.jsx'
import ConfiguracionModal from './components/ConfiguracionModal.jsx'

const DEFAULT_WS_URL = 'ws://192.168.1.28:8000/ws/nodes'
const MAX_HISTORY_POINTS = 20

export default function App() {
  const [nodes, setNodes] = useState({})
  const [history, setHistory] = useState([])
  const [rawLogs, setRawLogs] = useState([])
  const [connected, setConnected] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  // Estados de Configuración
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL)
  const [kwhRate, setKwhRate] = useState(850)
  const [theme, setTheme] = useState('cyan')

  const wsRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    function connect() {
      const ws = new WebSocket(wsUrl)
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
          setRawLogs((prev) => [reading, ...prev].slice(0, 200))
          setHistory((prev) => appendReading(prev, reading))
        }
      }
    }
    connect()
    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [wsUrl])

  const nodeList = Object.values(nodes).sort((a, b) => a.nodo.localeCompare(b.nodo))

  const handleNavigateToNode = (nodeId) => {
    setSelectedNodeId(nodeId)
    setActiveView('dispositivos')
  }

  const todayFormatted = () => {
    const d = new Date()
    const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <div className="h-screen bg-slate-50 flex text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 h-full flex-shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between p-4 hidden md:flex">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 bg-cyan-400 rounded-xl flex items-center justify-center text-slate-900 font-bold shadow-sm">
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-900 tracking-tight leading-none">EnergIA</h1>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeView === 'dashboard' ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Dashboard
              </div>
            </button>

            <button
              onClick={() => setActiveView('dispositivos')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeView === 'dispositivos' ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>
                Dispositivos
              </div>
            </button>

            <button
              onClick={() => setActiveView('alertas')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeView === 'alertas' ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                Alertas
              </div>
            </button>

            <button
              onClick={() => setActiveView('logs')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${activeView === 'logs' ? 'bg-emerald-50 text-emerald-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Logs del Sistema
              </div>
            </button>
          </nav>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-100">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
            Configuración
          </button>

          <div className="bg-slate-400/30 p-2.5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-400 text-slate-700 flex items-center justify-center font-bold text-xs">
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 leading-tight">Luis Olave</p>
                <p className="text-[10px] text-slate-500">Administrador</p>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-600 px-1">•••</button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="h-16 bg-slate-50/80 backdrop-blur border-b border-slate-200/60 flex items-center justify-between px-8 flex-shrink-0">
          <div>
            <p className="text-[11px] text-slate-400 capitalize">{todayFormatted()}</p>
            <h1 className="text-lg font-bold text-slate-900 capitalize">
              {activeView === 'dashboard' ? 'Resumen energético' : activeView === 'dispositivos' ? 'Dispositivos' : activeView === 'alertas' ? 'Alertas IA' : 'Logs del Sistema'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 border ${connected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></span>
              {connected ? 'Sistema operativo' : 'Desconectado'}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {activeView === 'dashboard' && <Dashboard nodeList={nodeList} history={history} onSelectNode={handleNavigateToNode} />}
          {activeView === 'dispositivos' && (
            <Dispositivos
              nodeList={nodeList}
              history={history}
              selectedNodeId={selectedNodeId}
              setSelectedNodeId={setSelectedNodeId}
            />
          )}
          {activeView === 'alertas' && <Alertas />}
          {activeView === 'logs' && <Logs rawLogs={rawLogs} />}
        </div>
      </main>

      <ConfiguracionModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        wsUrl={wsUrl}
        setWsUrl={setWsUrl}
        kwhRate={kwhRate}
        setKwhRate={setKwhRate}
        theme={theme}
        setTheme={setTheme}
      />
    </div>
  )
}

function appendReading(history, reading) {
  const time = new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const last = history[history.length - 1]
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