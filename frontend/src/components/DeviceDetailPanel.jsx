// Panel de detalle de un nodo (diseño claro de la vista Dispositivos).
// En escritorio va al lado de las tarjetas; en celular sube desde abajo.
import { useState } from 'react'
import EnergyChart from './EnergyChart.jsx'
import EstadoNodo from './EstadoNodo.jsx'
import { METRICAS, VENTANA_TIEMPO_REAL_MIN } from '../config.js'
import {
  MOTIVOS_REINICIO, calidadSenal, fmtDuracion, fmtHaceCuanto, fmtPotencia,
} from '../lib/formato.js'

function Dato({ titulo, valor, nota }) {
  return (
    <div className="min-w-0 py-2.5">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate num">{valor}</p>
      {nota && <p className="text-xs text-slate-500 truncate">{nota}</p>}
    </div>
  )
}

export default function DeviceDetailPanel({ nodo, series = {}, ahora, onCerrar, onConfigurar }) {
  const [metrica, setMetrica] = useState('potencia')
  if (!nodo) return null

  const info = nodo.infoEstado
  const enLinea = info?.estado === 'online'
  const desde = info?.desde ? Date.parse(info.desde) : null

  let tiempo = 'Sin información'
  let notaTiempo = null
  if (enLinea && info.uptime_s != null && desde) {
    tiempo = fmtDuracion(info.uptime_s + (ahora - desde) / 1000)
    notaTiempo = 'desde el último reinicio'
  } else if (info?.estado === 'offline' && desde) {
    tiempo = 'Desconectado'
    notaTiempo = fmtHaceCuanto(desde, ahora)
  }

  const puntos = series[nodo.id] || []
  const pico = puntos.length ? Math.max(...puntos.map((p) => p.potencia ?? 0)) : null

  return (
    <>
      {/* Fondo oscuro solo en celular */}
      <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onCerrar} />

      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-3xl lg:rounded-2xl lg:sticky lg:top-0 lg:max-h-none lg:w-80 bg-white border border-slate-200/70 p-5 shadow-xl lg:shadow-none space-y-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <span className="w-2.5 h-2.5 mt-2 rounded-full flex-shrink-0" style={{ backgroundColor: nodo.color }} aria-hidden="true"></span>
            <div className="min-w-0">
              <h3 className="font-semibold text-base text-slate-900 truncate">{nodo.nombreBase}</h3>
              <p className="text-xs text-slate-500 truncate">{nodo.ubicacion ? `${nodo.ubicacion} (${nodo.id})` : nodo.id}</p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar detalle"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <EstadoNodo estado={nodo.estado} />

        <div className="grid grid-cols-2 gap-x-4 divide-y divide-slate-100 [&>*:nth-child(2)]:border-t-0">
          <Dato titulo="Dirección IP" valor={info?.ip || 'Sin información'} />
          <Dato
            titulo="Señal WiFi"
            valor={info?.rssi != null ? `${info.rssi} dBm` : 'Sin información'}
            nota={calidadSenal(info?.rssi)}
          />
          <Dato titulo="Tiempo encendido" valor={tiempo} nota={notaTiempo} />
          <Dato
            titulo="Último reinicio"
            valor={info?.reset ? (MOTIVOS_REINICIO[info.reset] || info.reset) : 'Sin información'}
          />
          <Dato titulo="Última lectura" valor={fmtHaceCuanto(nodo.tsUltimaLectura, ahora)} />
          <Dato titulo={`Pico (${VENTANA_TIEMPO_REAL_MIN} min)`} valor={pico != null ? fmtPotencia(pico) : '--'} />
        </div>

        <div className="space-y-2 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900">Últimos {VENTANA_TIEMPO_REAL_MIN} minutos</p>
            <div className="flex gap-1">
              {Object.entries(METRICAS).map(([clave, m]) => (
                <button
                  key={clave}
                  onClick={() => setMetrica(clave)}
                  aria-pressed={metrica === clave}
                  className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${metrica === clave ? 'bg-primario-50 text-primario-700' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {m.unidad}
                </button>
              ))}
            </div>
          </div>
          <div className="w-full">
            <EnergyChart nodos={[nodo]} series={series} metrica={metrica} altura={120} mostrarLeyenda={false} />
          </div>
        </div>

        <button
          onClick={() => onConfigurar(nodo.id)}
          className="w-full py-2.5 btn-principal bg-primario-600 hover:bg-primario-700 text-white font-semibold text-sm rounded-xl transition-colors"
        >
          Configurar este nodo
        </button>
      </div>
    </>
  )
}
