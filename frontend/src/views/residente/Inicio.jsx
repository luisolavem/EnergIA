// Inicio del residente: cuánto se gasta, en qué y si todo funciona.
// Todo en pesos (con la tarifa de Ajustes); el kWh queda como dato secundario.
import { useMemo } from 'react'
import AvisosIA from '../../components/AvisosIA.jsx'
import BarrasHora from '../../components/BarrasHora.jsx'
import PrediccionHoy from '../../components/PrediccionHoy.jsx'
import PrediccionSemana from '../../components/PrediccionSemana.jsx'
import RankingAparatos from '../../components/RankingAparatos.jsx'
import { Etiqueta, Icono, Indicador, Tarjeta } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { fechaLarga, fmtMoneda, fmtNumero, saludo } from '../../lib/formato.js'
import { ESTADO, estadoResidente } from '../../lib/nodos.js'

const DIA_MS = 86_400_000
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Mensaje general en lenguaje sencillo
function estadoGeneral(conectado, nodos) {
  if (!conectado) return { tono: 'falla', texto: 'Sin conexión con el medidor de la casa' }
  const caidos = nodos.filter((n) => n.estado === ESTADO.DESCONECTADO || n.estado === ESTADO.SIN_DATOS)
  if (caidos.length === 0) return { tono: 'ok', texto: 'Todo funciona correctamente' }
  if (caidos.length === 1) return { tono: 'aviso', texto: `${caidos[0].nombre} no envía datos` }
  return { tono: 'aviso', texto: `${caidos.length} aparatos no envían datos` }
}

// kWh por día a partir de las horas de la semana
function porDia(horas = []) {
  const dias = new Map()
  for (const fila of horas) {
    const d = new Date(fila.inicio)
    const clave = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const total = Object.values(fila.valores || {}).reduce((a, b) => a + b, 0)
    dias.set(clave, (dias.get(clave) || 0) + total)
  }
  return [...dias.entries()].sort((a, b) => a[0] - b[0]).map(([t, kwh]) => ({ t, kwh }))
}

function Semana({ dias, tarifaKwh }) {
  if (dias.length < 2) return null
  const maximo = Math.max(...dias.map((d) => d.kwh), 0.01)
  const hoy = new Date().setHours(0, 0, 0, 0)
  return (
    <div>
      <div className="flex items-end gap-1.5 h-24" aria-label="Costo de cada día de los últimos 7 días">
        {dias.map((d) => (
          <div key={d.t} className="flex-1 flex flex-col items-center justify-end h-full" title={`${fmtMoneda(d.kwh * tarifaKwh)}`}>
            <span
              className={`w-full rounded-md ${d.t === hoy ? 'bg-primario-100 border border-dashed border-primario-300' : 'bg-primario-200 hover:bg-primario-300'}`}
              style={{ height: `${Math.max(4, (d.kwh / maximo) * 100)}%` }}
            ></span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {dias.map((d) => (
          <span key={d.t} className="flex-1 text-center text-xs text-slate-500">
            {d.t === hoy ? 'Hoy' : DIAS_CORTOS[new Date(d.t).getDay()]}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Inicio({ nodos = [], tarifaKwh, conectado, energiaHoy, energiaSemana, avisos = true, ia }) {
  const { usuario } = useAuth()
  const general = estadoGeneral(conectado, nodos)

  const kwhHoy = energiaHoy.datos?.total_kwh ?? null
  const conDato = nodos.filter((n) => n.potencia != null)
  const vatiosAhora = conDato.reduce((acc, n) => acc + n.potencia, 0)
  const encendidos = nodos.filter((n) => n.estado === ESTADO.ACTIVO)

  // Estimado del mes: promedio diario de los últimos días x 30
  const semana = energiaSemana.datos
  const dias = useMemo(() => porDia(semana?.horas), [semana])
  const diasMedidos = semana ? (Date.now() - Date.parse(semana.desde)) / DIA_MS : 0
  const promedioDiario = semana && diasMedidos >= 1 ? semana.total_kwh / diasMedidos : null
  const estimadoMes = promedioDiario != null ? promedioDiario * 30 * tarifaKwh : null

  const elementos = nodos.map((n) => ({
    id: n.id, nombre: n.nombre, color: n.color,
    kwh: energiaHoy.datos?.nodos?.[n.id] ?? 0,
    estado: estadoResidente(n),
  }))

  const nombre = usuario?.nombre || ''

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">
            {saludo()}{nombre ? `, ${nombre}` : ''}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{fechaLarga()}</p>
        </div>
        {(avisos || general.tono === 'ok') && (
          <Etiqueta tono={general.tono} className="self-start sm:self-auto">{general.texto}</Etiqueta>
        )}
      </div>

      <AvisosIA alertas={ia?.alertas} nodos={nodos} tarifaKwh={tarifaKwh} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">
        {/* Estimado del mes: el dato principal */}
        <section className="md:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 md:p-6 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-end">
          <div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-600">Costo estimado del mes</p>
              <span className="text-slate-400 sm:hidden"><Icono nombre="moneda" /></span>
            </div>
            <p className="mt-2 text-4xl md:text-[44px] leading-none font-semibold text-slate-900 tracking-tight">
              {estimadoMes == null ? '--' : fmtMoneda(estimadoMes)}
            </p>
            <p className="text-[13px] text-slate-500 mt-3">
              {estimadoMes == null
                ? (energiaSemana.error || 'Calculando con el consumo de los últimos días...')
                : `Aparatos medidos, si siguen como en los últimos ${fmtNumero(Math.min(diasMedidos, 7), 0)} días: ${fmtNumero(promedioDiario, 1)} kWh por día a ${fmtMoneda(tarifaKwh)} el kWh.`}
            </p>
          </div>
          <Semana dias={dias} tarifaKwh={tarifaKwh} />
        </section>

        <PrediccionHoy
          kwhHoy={kwhHoy}
          prediccion={ia?.prediccion}
          errorPrediccion={ia?.errorPrediccion}
          tarifaKwh={tarifaKwh}
        />
        <Indicador
          titulo="Consumiendo ahora"
          icono="rayo"
          valor={conDato.length ? fmtMoneda((vatiosAhora / 1000) * tarifaKwh) : '--'}
          unidad={conDato.length ? 'por hora' : null}
          nota={encendidos.length === 0 ? 'Ningún aparato encendido' : encendidos.map((n) => n.nombre).join(', ')}
        />
      </div>

      <PrediccionSemana prediccion={ia?.prediccion} tarifaKwh={tarifaKwh} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4 md:gap-5">
        <Tarjeta titulo="Tus aparatos hoy" descripcion="Ordenados por lo que llevan costando.">
          <RankingAparatos
            elementos={elementos}
            tarifaKwh={tarifaKwh}
            textoVacio={energiaHoy.error || (energiaHoy.datos ? 'Todavía no hay consumo registrado hoy.' : 'Calculando...')}
          />
        </Tarjeta>
        <Tarjeta titulo="Consumo de hoy por hora" descripcion="En pesos. Toca una barra para ver el detalle.">
          {energiaHoy.datos
            ? <BarrasHora horas={energiaHoy.datos.horas} nodos={nodos} tarifaKwh={tarifaKwh} />
            : <p className="text-[13px] text-slate-500 py-6 text-center">{energiaHoy.error || 'Calculando...'}</p>}
        </Tarjeta>
      </div>
    </div>
  )
}
