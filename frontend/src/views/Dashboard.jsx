import { useMemo, useState } from 'react'
import DonutChart from '../components/DonutChart.jsx'
import EnergyChart from '../components/EnergyChart.jsx'
import NodeCard from '../components/NodeCard.jsx'
import useEnergia from '../hooks/useEnergia.js'
import { METRICAS, VENTANA_TIEMPO_REAL_MIN } from '../config.js'
import { fmtMoneda, fmtNumero } from '../lib/formato.js'
import { ESTADO, estaEnLinea } from '../lib/nodos.js'

const PERIODOS = { hoy: 'hoy', semana: 'últimos 7 días' }
const claseSelect = 'px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primario-500/20 focus:border-primario-500'

function TarjetaKpi({ titulo, valor, unidad, nota, icono }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{titulo}</p>
        <h2 className="text-2xl font-bold text-slate-900 mt-1">
          {valor} {unidad && <span className="text-sm font-normal text-slate-500">{unidad}</span>}
        </h2>
        <p className="text-xs text-slate-400 mt-2 truncate">{nota}</p>
      </div>
      <div className="w-12 h-12 bg-tinta rounded-xl flex items-center justify-center text-primario-400 flex-shrink-0">
        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d={icono} /></svg>
      </div>
    </div>
  )
}

const ICONO_RAYO = 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z'
const ICONO_ENERGIA = 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' // calendario
const ICONO_VOLTAJE = 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z'
const ICONO_NODOS = 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z'

export default function Dashboard({ nodos = [], series = {}, tarifaKwh, urlBackend, conectado, onSeleccionarNodo }) {
  const [filtroNodo, setFiltroNodo] = useState('todos')
  const [metrica, setMetrica] = useState('potencia')
  const [periodo, setPeriodo] = useState('hoy')
  const energia = useEnergia(urlBackend, periodo, conectado)

  const visibles = useMemo(
    () => (filtroNodo === 'todos' ? nodos : nodos.filter((n) => n.id === filtroNodo)),
    [nodos, filtroNodo],
  )

  // Potencia actual: los nodos sin carga suman 0; los desconectados no suman.
  const conDato = visibles.filter((n) => n.potencia != null)
  const potenciaKw = visibles.reduce((acc, n) => acc + (n.potencia ?? 0), 0) / 1000
  const activos = visibles.filter((n) => n.estado === ESTADO.ACTIVO)
  const voltajePromedio = activos.length
    ? activos.reduce((acc, n) => acc + n.voltaje, 0) / activos.length
    : null
  const enLinea = visibles.filter(estaEnLinea).length

  const kwh = energia.datos
    ? (filtroNodo === 'todos' ? energia.datos.total_kwh : (energia.datos.nodos?.[filtroNodo] ?? 0))
    : null
  const notaEnergia = energia.error
    ? energia.error
    : kwh == null ? 'Calculando...' : `≈ ${fmtMoneda(kwh * tarifaKwh)} a ${fmtMoneda(tarifaKwh)}/kWh`

  const elementosDona = nodos.map((n) => ({
    id: n.id, nombre: n.nombre, color: n.color, valor: energia.datos?.nodos?.[n.id] ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* Barra de filtros */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Filtrar vista global</h2>
          <p className="text-xs text-slate-400">Aísla un nodo y elige el periodo de energía</p>
        </div>
        <div className="flex gap-2">
          <select value={filtroNodo} onChange={(e) => setFiltroNodo(e.target.value)} className={claseSelect} aria-label="Nodo">
            <option value="todos">Todos los nodos ({nodos.length})</option>
            {nodos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
          </select>
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={claseSelect} aria-label="Periodo">
            <option value="hoy">Hoy</option>
            <option value="semana">Últimos 7 días</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <TarjetaKpi
          titulo="Potencia actual"
          valor={conDato.length ? fmtNumero(potenciaKw, 2) : '--'}
          unidad="kW"
          nota={conDato.length ? 'Suma de lo que se consume ahora' : 'Sin lecturas actuales'}
          icono={ICONO_RAYO}
        />
        <TarjetaKpi
          titulo={`Energía ${PERIODOS[periodo]}`}
          valor={kwh == null ? '--' : fmtNumero(kwh, 2)}
          unidad="kWh"
          nota={notaEnergia}
          icono={ICONO_ENERGIA}
        />
        <TarjetaKpi
          titulo="Voltaje promedio"
          valor={voltajePromedio == null ? '--' : fmtNumero(voltajePromedio, 1)}
          unidad="V"
          nota={activos.length ? `Medido en ${activos.length} ${activos.length === 1 ? 'nodo activo' : 'nodos activos'}` : 'Solo se mide con carga conectada'}
          icono={ICONO_VOLTAJE}
        />
        <TarjetaKpi
          titulo="Nodos en línea"
          valor={enLinea}
          unidad={`de ${visibles.length}`}
          nota={`${activos.length} con aparato encendido`}
          icono={ICONO_NODOS}
        />
      </div>

      {/* Gráfica + dona */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Comportamiento en tiempo real</h3>
              <p className="text-xs text-slate-400">Últimos {VENTANA_TIEMPO_REAL_MIN} minutos · una línea por nodo</p>
            </div>
            <select
              value={metrica}
              onChange={(e) => setMetrica(e.target.value)}
              aria-label="Variable"
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primario-500/20"
            >
              {Object.entries(METRICAS).map(([clave, m]) => (
                <option key={clave} value={clave}>{m.etiqueta} ({m.unidad})</option>
              ))}
            </select>
          </div>
          <div className="w-full bg-slate-50/50 rounded-xl border border-slate-100 p-2">
            <EnergyChart nodos={visibles} series={series} metrica={metrica} altura={200} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Distribución por nodo</h3>
            <p className="text-xs text-slate-400 mb-4">Energía consumida {PERIODOS[periodo]}</p>
          </div>
          <DonutChart
            elementos={elementosDona}
            textoVacio={energia.cargando ? 'Calculando...' : 'Sin consumo registrado en este periodo'}
          />
        </div>
      </div>

      {/* Tarjetas de nodos */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="mb-4">
          <h3 className="font-bold text-slate-900 text-sm">Estado de dispositivos</h3>
          <p className="text-xs text-slate-400">Haz clic en una tarjeta para ver su telemetría en detalle</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibles.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 col-span-full text-center">
              {conectado ? 'Ningún nodo ha reportado datos todavía.' : 'Sin conexión con el servidor.'}
            </p>
          ) : (
            visibles.map((n) => <NodeCard key={n.id} nodo={n} onClick={() => onSeleccionarNodo(n.id)} />)
          )}
        </div>
      </div>
    </div>
  )
}
