// Alertas IA (solo técnico): horas anómalas que detecta el Isolation Forest,
// la predicción de las próximas 24 horas, el estado de los modelos en la
// Raspberry y cómo le va a la predicción frente al consumo real.
import { useCallback, useEffect, useMemo, useState } from 'react'
import BarrasPrediccion from '../../components/BarrasPrediccion.jsx'
import {
  Etiqueta, Icono, Indicador, Mensaje, PuntoAparato, Selector, Tarjeta, Vacio, claseBotonSecundario,
} from '../../components/ui.jsx'
import { api } from '../../lib/api.js'
import { fmtFechaHora, fmtHaceCuanto, fmtMoneda, fmtNumero } from '../../lib/formato.js'
import { TIPOS_ALERTA, diaRelativo, fmtWh, franja, semanaPrevista } from '../../lib/ia.js'

const REFRESCO_MODELOS_MS = 5 * 60_000
const DIA_MS = 86_400_000

const fechaCorta = (texto) => {
  if (!texto) return '--'
  const d = new Date(texto.length <= 10 ? `${texto}T00:00:00` : texto.replace(' ', 'T'))
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Consumo de cada hora del día de la alerta, sacado de /api/energia?periodo=semana
function ConsumoDelDia({ alerta, nodo, energiaSemana }) {
  const inicioAlerta = Date.parse(alerta.inicio)
  const dia = new Date(inicioAlerta).setHours(0, 0, 0, 0)
  const horas = useMemo(() => {
    const valores = Array(24).fill(null)
    for (const fila of energiaSemana.datos?.horas || []) {
      const t = Date.parse(fila.inicio)
      if (t < dia || t >= dia + DIA_MS) continue
      const h = new Date(t).getHours()
      valores[h] = (valores[h] || 0) + (fila.valores?.[alerta.nodo] || 0)
    }
    return valores
  }, [energiaSemana.datos, dia, alerta.nodo])

  if (horas.every((v) => v == null)) {
    return <p className="text-[13px] text-slate-500">La gráfica solo está disponible para alertas de los últimos 7 días.</p>
  }
  const horaAlerta = new Date(inicioAlerta).getHours()
  const maximo = Math.max(...horas.map((v) => v || 0), alerta.kwh || 0, alerta.normal_kwh || 0, 0.005)
  const color = nodo?.color || '#64748b'
  return (
    <div>
      <div className="flex items-end gap-[3px] h-28" aria-label="Consumo de cada hora de ese día">
        {horas.map((v, h) => (
          <span key={h} className="flex-1 h-full flex flex-col justify-end relative" title={`${h}:00 · ${fmtWh(v)}`}>
            {h === horaAlerta && alerta.normal_kwh != null && (
              <span className="absolute left-[-2px] right-[-2px] border-t-2 border-dashed border-slate-500"
                style={{ bottom: `${(alerta.normal_kwh / maximo) * 100}%` }}></span>
            )}
            <span className={`w-full rounded-t-[3px] ${h === horaAlerta ? '' : 'bg-slate-200'}`}
              style={{
                height: `${Math.max(2, ((v || 0) / maximo) * 100)}%`,
                backgroundColor: h === horaAlerta ? color : undefined,
              }}
            ></span>
          </span>
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-500 num mt-1.5">
        <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span>
      </div>
      <p className="text-xs text-slate-500 mt-2">
        En color, la hora de la alerta. La línea punteada es lo normal de ese aparato a esa hora.
      </p>
    </div>
  )
}

function FilaAlerta({ alerta, nodo, abierta, onAlternar, energiaSemana }) {
  const tipo = TIPOS_ALERTA[alerta.tipo] || TIPOS_ALERTA.inusual
  const inicio = Date.parse(alerta.inicio)
  return (
    <li>
      <button type="button" onClick={onAlternar} aria-expanded={abierta}
        className="w-full text-left py-3.5 grid grid-cols-[10px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-start">
        <PuntoAparato color={nodo?.color || '#94a3b8'} className="mt-1.5" />
        <span className="min-w-0">
          <span className="text-sm font-semibold text-slate-900">{nodo?.nombre || alerta.aparato}</span>
          <span className="text-[13px] text-slate-500"> · {diaRelativo(inicio)}, {franja(alerta)}</span>
          <span className="block text-[13px] text-slate-600 mt-0.5">{alerta.descripcion}</span>
          <span className="block sm:hidden mt-2"><Etiqueta tono={tipo.tono}>{tipo.texto}</Etiqueta></span>
        </span>
        <span className="hidden sm:block"><Etiqueta tono={tipo.tono}>{tipo.texto}</Etiqueta></span>
      </button>
      {abierta && (
        <div className="pb-4 pl-[22px] grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
          <ConsumoDelDia alerta={alerta} nodo={nodo} energiaSemana={energiaSemana} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] self-start">
            <div><dt className="text-slate-500">Tipo</dt><dd className="font-medium text-slate-900">{tipo.texto}</dd></div>
            <div><dt className="text-slate-500">Consumo de la hora</dt><dd className="font-medium text-slate-900 num">{fmtWh(alerta.kwh)}</dd></div>
            <div><dt className="text-slate-500">Normal a esa hora</dt><dd className="font-medium text-slate-900 num">{fmtWh(alerta.normal_kwh)}</dd></div>
            <div>
              <dt className="text-slate-500">Puntaje / umbral</dt>
              <dd className="font-medium text-slate-900 num">{fmtNumero(alerta.puntaje, 3)} / {fmtNumero(alerta.umbral, 3)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Detectada</dt>
              <dd className="font-medium text-slate-900 num">{fmtFechaHora(Date.parse(alerta.detectada))}</dd>
            </div>
            <p className="col-span-2 text-xs text-slate-500">
              Mientras más negativo el puntaje, más rara la hora. Por debajo del umbral se genera la alerta.
            </p>
          </dl>
        </div>
      )}
    </li>
  )
}

function TablaMetricas({ entrenamiento }) {
  const pred = entrenamiento?.prediccion
  if (!pred?.metricas) return <Vacio>Sin métricas.</Vacio>
  const filas = Object.entries(pred.metricas)
  const semanal = filas.some(([, m]) => m.MAPE_semanal_pct != null)
  const cv = pred.validacion_cruzada_MAE_Wh || {}
  const horizonte = pred.error_por_dia_horizonte_pct
  const origenes = pred.evaluacion?.origenes?.length
  const nombreFila = (nombre) => (
    <>
      {nombre}
      {nombre === pred.tipo && <span className="ml-2 text-xs font-medium text-primario-700">en uso</span>}
    </>
  )
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="font-medium py-2 px-1">Opción</th>
              <th className="font-medium py-2 px-1 text-right">Error por hora</th>
              {semanal && <th className="font-medium py-2 px-1 text-right">Error semanal</th>}
              <th className="font-medium py-2 px-1 text-right">Error diario</th>
              {!semanal && <th className="font-medium py-2 px-1 text-right">Validación cruzada</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map(([nombre, m]) => (
              <tr key={nombre} className={nombre === pred.tipo ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                <td className="py-2 px-1">{nombreFila(nombre)}</td>
                <td className="py-2 px-1 text-right num">{fmtNumero(m.MAE_Wh, 1)} Wh</td>
                {semanal && <td className="py-2 px-1 text-right num">{fmtNumero(m.MAPE_semanal_pct, 1)} %</td>}
                <td className="py-2 px-1 text-right num">{fmtNumero(m.MAPE_diario_pct, 1)} %</td>
                {!semanal && <td className="py-2 px-1 text-right num">{cv[nombre] != null ? `${fmtNumero(cv[nombre], 1)} Wh` : '--'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {horizonte && (
        <div className="overflow-x-auto -mx-1">
          <p className="text-[13px] font-medium text-slate-700 px-1 mb-1">Error diario según el día de horizonte (%)</p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="font-medium py-2 px-1">Opción</th>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => <th key={d} className="font-medium py-2 px-1 text-right">Día {d}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(horizonte).map(([nombre, valores]) => (
                <tr key={nombre} className={nombre === pred.tipo ? 'font-semibold text-slate-900' : 'text-slate-700'}>
                  <td className="py-2 px-1 whitespace-nowrap">{nombreFila(nombre)}</td>
                  {valores.map((v, i) => <td key={i} className="py-2 px-1 text-right num whitespace-nowrap">{fmtNumero(v, 1)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {semanal
          ? `Predicción semanal recursiva evaluada desde ${origenes || 'varios'} orígenes: cada semana se predijo con un modelo entrenado solo con los datos anteriores. "Semana pasada" y "Promedio 7 días" son referencias sin IA.`
          : 'Semana de prueba que el modelo no vio al entrenar. "Semana pasada" y "Promedio 7 días" son referencias sin IA.'}
      </p>
    </div>
  )
}

function Dato({ titulo, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-slate-500">{titulo}</dt>
      <dd className="text-sm font-medium text-slate-900 num mt-0.5">{children}</dd>
    </div>
  )
}

function DesempenoSemanal({ semanal }) {
  if (!semanal || semanal.semanas_evaluadas === 0) {
    return (
      <Vacio>
        Cada medianoche se guarda la predicción de los 7 días siguientes. Cuando esa semana termina, aparece aquí
        junto a lo que realmente se consumió.
      </Vacio>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Dato titulo="Semanas evaluadas">{semanal.semanas_evaluadas}</Dato>
        <Dato titulo="Error semanal promedio">{fmtNumero(semanal.mape_semanal_pct, 1)} %</Dato>
        <Dato titulo="Error por hora">{fmtNumero(semanal.mae_wh, 1)} Wh</Dato>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="font-medium py-2 px-1">Semana desde</th>
              <th className="font-medium py-2 px-1 text-right">Real</th>
              <th className="font-medium py-2 px-1 text-right">Predicho</th>
              <th className="font-medium py-2 px-1 text-right">Error</th>
              <th className="font-medium py-2 px-1 text-right hidden md:table-cell">Error día 1 → día 7</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {[...semanal.semanas].reverse().map((s) => (
              <tr key={s.origen}>
                <td className="py-2 px-1">{fechaCorta(s.origen)}</td>
                <td className="py-2 px-1 text-right num">{fmtNumero(s.real_kwh, 2)} kWh</td>
                <td className="py-2 px-1 text-right num">{fmtNumero(s.predicho_kwh, 2)} kWh</td>
                <td className="py-2 px-1 text-right num font-medium text-slate-900">{s.error_pct == null ? '--' : `${fmtNumero(s.error_pct, 1)} %`}</td>
                <td className="py-2 px-1 text-right num text-slate-500 hidden md:table-cell">
                  {(s.error_por_dia_pct || []).map((v) => (v == null ? '--' : fmtNumero(v, 0))).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DesempenoReal({ desempeno }) {
  if (!desempeno || desempeno.dias_evaluados === 0) {
    return (
      <Vacio>
        Todavía no hay días completos para comparar. Cada medianoche se guarda la predicción del día y al día
        siguiente aparece aquí junto a lo que realmente se consumió.
      </Vacio>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Dato titulo="Días evaluados">{desempeno.dias_evaluados}</Dato>
        <Dato titulo="Error diario promedio">{fmtNumero(desempeno.mape_diario_pct, 1)} %</Dato>
        <Dato titulo="Error por hora">{fmtNumero(desempeno.mae_wh, 1)} Wh</Dato>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="font-medium py-2 px-1">Día</th>
              <th className="font-medium py-2 px-1 text-right">Real</th>
              <th className="font-medium py-2 px-1 text-right">Predicho</th>
              <th className="font-medium py-2 px-1 text-right">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {[...desempeno.dias].reverse().map((d) => (
              <tr key={d.fecha}>
                <td className="py-2 px-1">{fechaCorta(d.fecha)}</td>
                <td className="py-2 px-1 text-right num">{fmtNumero(d.real_kwh, 2)} kWh</td>
                <td className="py-2 px-1 text-right num">{fmtNumero(d.predicho_kwh, 2)} kWh</td>
                <td className="py-2 px-1 text-right num font-medium text-slate-900">{d.error_pct == null ? '--' : `${fmtNumero(d.error_pct, 1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Se compara el primer día de la predicción hecha a medianoche con lo medido ese día.
      </p>
    </div>
  )
}

export default function AlertasIA({ ia, nodos = [], tarifaKwh, energiaSemana, urlBackend, conectado }) {
  const { alertas, prediccion, activo } = ia
  const [estado, setEstado] = useState(null)
  const [errorEstado, setErrorEstado] = useState(null)
  const [recargando, setRecargando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [filtroNodo, setFiltroNodo] = useState('todos')
  const [dias, setDias] = useState('7')
  const [abierta, setAbierta] = useState(null)
  const [modoPrediccion, setModoPrediccion] = useState('7d')

  const consultarEstado = useCallback(() => {
    api.modelos(urlBackend)
      .then((r) => { setEstado(r); setErrorEstado(null) })
      .catch((e) => setErrorEstado(e.estado === 404
        ? 'El servidor no tiene el módulo de IA. Actualiza el backend a la versión 0.4.'
        : `No se pudo consultar el estado de los modelos (${e.message}).`))
  }, [urlBackend])

  useEffect(() => {
    if (!conectado) return undefined
    consultarEstado()
    const id = setInterval(consultarEstado, REFRESCO_MODELOS_MS)
    return () => clearInterval(id)
  }, [conectado, consultarEstado])

  const recargar = async () => {
    setRecargando(true)
    setMensaje(null)
    try {
      const r = await api.recargarModelos(urlBackend)
      setEstado(r.modelos)
      ia.refrescar()
      setMensaje({ tipo: 'ok', texto: 'Modelos recargados desde la carpeta modelos/ de la Raspberry.' })
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setRecargando(false)
    }
  }

  const nodoPorId = useMemo(() => Object.fromEntries(nodos.map((n) => [n.id, n])), [nodos])
  const desde = Date.now() - Number(dias) * DIA_MS
  const filtradas = alertas.filter((a) => Date.parse(a.inicio) >= desde && (filtroNodo === 'todos' || a.nodo === filtroNodo))
  const semana = alertas.filter((a) => Date.parse(a.inicio) >= Date.now() - 7 * DIA_MS)

  const entrenamiento = estado?.entrenamiento
  const ejecucion = estado?.ejecucion
  const desempeno = estado?.desempeno_real
  const semanal = estado?.desempeno_semanal
  const semanaPred = semanaPrevista(prediccion)
  const sk = estado?.scikit_learn
  const cargados = estado ? estado.cargados : activo

  if (errorEstado && !estado) {
    return (
      <Tarjeta titulo="El módulo de IA no está disponible">
        <p className="text-sm text-slate-600">{errorEstado}</p>
      </Tarjeta>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
        <Indicador
          titulo="Modelos"
          icono="ia"
          valor={cargados == null ? '--' : cargados ? 'Activos' : 'Inactivos'}
          nota={estado?.error || (entrenamiento ? `${entrenamiento.prediccion?.tipo} · ${fechaCorta(entrenamiento.creado)}` : 'Consultando...')}
        />
        {semanaPred ? (
          <Indicador
            titulo="Próximos 7 días"
            icono="rayo"
            valor={fmtNumero(semanaPred.total, 1)}
            unidad="kWh"
            nota={`${fmtMoneda(semanaPred.total * tarifaKwh)} · hoy ~${fmtNumero(prediccion.hoy?.estimado_kwh, 2)} kWh`}
          />
        ) : (
          <Indicador
            titulo="Próximas 24 horas"
            icono="rayo"
            valor={prediccion?.disponible ? fmtNumero(prediccion.total_24h_kwh, 2) : '--'}
            unidad={prediccion?.disponible ? 'kWh' : null}
            nota={prediccion?.disponible ? `${fmtMoneda(prediccion.total_24h_kwh * tarifaKwh)} previstos` : (prediccion?.motivo || ia.errorPrediccion || 'Calculando...')}
          />
        )}
        <Indicador
          titulo="Alertas en 7 días"
          icono="alerta"
          valor={semana.length}
          nota={semana.length ? `La última ${fmtHaceCuanto(Date.parse(semana[0].inicio))}` : 'Ninguna hora anómala'}
        />
        {semanal?.semanas_evaluadas ? (
          <Indicador
            titulo="Error real semanal"
            icono="diana"
            valor={fmtNumero(semanal.mape_semanal_pct, 1)}
            unidad="%"
            nota={`Promedio de ${semanal.semanas_evaluadas} ${semanal.semanas_evaluadas === 1 ? 'semana' : 'semanas'}`}
          />
        ) : (
          <Indicador
            titulo="Error real diario"
            icono="diana"
            valor={desempeno?.mape_diario_pct != null ? fmtNumero(desempeno.mape_diario_pct, 1) : '--'}
            unidad={desempeno?.mape_diario_pct != null ? '%' : null}
            nota={desempeno?.dias_evaluados
              ? `Promedio de ${desempeno.dias_evaluados} ${desempeno.dias_evaluados === 1 ? 'día' : 'días'}`
              : 'Se mide desde la próxima medianoche'}
          />
        )}
      </div>

      <Tarjeta
        titulo="Horas anómalas"
        descripcion="Detectadas por el Isolation Forest de cada aparato. Toca una para ver el detalle."
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <Selector value={filtroNodo} onChange={setFiltroNodo} etiqueta="Aparato">
            <option value="todos">Todos los aparatos</option>
            {nodos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
          </Selector>
          <Selector value={dias} onChange={setDias} etiqueta="Periodo">
            <option value="1">Últimas 24 horas</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </Selector>
        </div>
        {filtradas.length === 0 ? (
          <Vacio>{cargados === false ? 'Los modelos no están cargados.' : 'No se detectaron horas anómalas en este periodo.'}</Vacio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtradas.map((a) => (
              <FilaAlerta
                key={a.id}
                alerta={a}
                nodo={nodoPorId[a.nodo]}
                abierta={abierta === a.id}
                onAlternar={() => setAbierta(abierta === a.id ? null : a.id)}
                energiaSemana={energiaSemana}
              />
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta
        titulo={modoPrediccion === '7d' ? 'Predicción de los próximos 7 días' : 'Predicción de las próximas 24 horas'}
        descripcion={prediccion?.disponible
          ? `${prediccion.modelo || 'Modelo'}${modoPrediccion === '7d' ? ' encadenado día a día' : ''}, calculada ${fmtHaceCuanto(Date.parse(prediccion.generada))}. Historia completa: ${fmtNumero(prediccion.historia_completa_pct, 0)} %.`
          : 'Energía prevista por aparato.'}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <Selector value={modoPrediccion} onChange={setModoPrediccion} etiqueta="Horizonte">
            <option value="7d">Próximos 7 días</option>
            <option value="24h">Próximas 24 horas</option>
          </Selector>
        </div>
        <BarrasPrediccion prediccion={prediccion} nodos={nodos} tarifaKwh={tarifaKwh} modo={modoPrediccion} />
      </Tarjeta>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
        <Tarjeta titulo="Entrenamiento" descripcion={entrenamiento?.datos
          ? `Datos del ${fechaCorta(entrenamiento.datos.desde)} al ${fechaCorta(entrenamiento.datos.hasta)} · ${fmtNumero(entrenamiento.datos.horas, 0)} horas.`
          : 'Resultado del notebook de Colab.'}>
          <TablaMetricas entrenamiento={entrenamiento} />
        </Tarjeta>

        <Tarjeta
          titulo="Funcionamiento en la Raspberry"
          descripcion="Se recalcula cada 5 minutos."
          acciones={(
            <button type="button" onClick={recargar} disabled={recargando} className={`${claseBotonSecundario} !py-2 text-[13px]`}>
              {recargando ? 'Recargando...' : 'Recargar modelos'}
            </button>
          )}
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Dato titulo="Última ejecución">{ejecucion?.ultima ? fmtHaceCuanto(Date.parse(ejecucion.ultima)) : '--'}</Dato>
            <Dato titulo="Duración del ciclo">{ejecucion?.duracion_s != null ? `${fmtNumero(ejecucion.duracion_s, 1)} s` : '--'}</Dato>
            <Dato titulo="Historia completa">{ejecucion?.historia_completa_pct != null ? `${fmtNumero(ejecucion.historia_completa_pct, 0)} %` : '--'}</Dato>
            <Dato titulo="Horas sin datos (7 días)">{ejecucion?.horas_sin_datos_7d ?? '--'}</Dato>
            <Dato titulo="scikit-learn">
              {sk?.instalado || '--'}
              {sk && !sk.coinciden && <span className="block text-xs font-normal text-amber-700">Entrenado con {sk.entrenamiento}</span>}
            </Dato>
            <Dato titulo="Umbral de anomalías">
              {entrenamiento?.anomalias?.percentil_umbral != null ? `${fmtNumero(entrenamiento.anomalias.percentil_umbral, 0)} % más raro` : '--'}
            </Dato>
          </dl>
          {(estado?.error_ultimo_ciclo || estado?.error) && (
            <p className="mt-4 text-[13px] text-slate-700 inline-flex items-start gap-2">
              <span className="text-amber-600 mt-0.5"><Icono nombre="alerta" className="w-4 h-4" /></span>
              {estado.error || estado.error_ultimo_ciclo}
            </p>
          )}
          <div className="mt-4"><Mensaje mensaje={mensaje} /></div>
          <p className="text-xs text-slate-500 mt-3">
            Tras copiar un zip nuevo a ~/backend_iot/modelos/, "Recargar modelos" los usa sin reiniciar el servidor.
          </p>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
        <Tarjeta titulo="Predicción semanal frente a consumo real" descripcion="Cada semana predicha a medianoche, comparada con lo medido.">
          <DesempenoSemanal semanal={semanal} />
        </Tarjeta>
        <Tarjeta titulo="Predicción del día frente a consumo real" descripcion="El primer día de cada predicción, día por día.">
          <DesempenoReal desempeno={desempeno} />
        </Tarjeta>
      </div>
    </div>
  )
}
