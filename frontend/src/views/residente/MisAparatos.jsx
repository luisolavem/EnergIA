// Mis aparatos (residente): cuánto cuesta cada aparato, sin datos técnicos.
import { EstadoTexto, Icono, PuntoAparato, Vacio } from '../../components/ui.jsx'
import { fmtMoneda, fmtNumero } from '../../lib/formato.js'
import { TIPOS_RESIDENTE, conPunto, diaRelativo, franja, restoDelDia, semanaPrevista } from '../../lib/ia.js'
import { estadoResidente } from '../../lib/nodos.js'

const DIA_MS = 86_400_000
const VIGENCIA_AVISO_MS = 24 * 3_600_000

function Cifra({ titulo, valor, nota }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="text-lg font-semibold text-slate-900 num mt-0.5">{valor}</p>
      {nota && <p className="text-xs text-slate-500 num">{nota}</p>}
    </div>
  )
}

export default function MisAparatos({ nodos = [], tarifaKwh, conectado, energiaHoy, energiaSemana, ia }) {
  if (nodos.length === 0) {
    return <Vacio>{conectado ? 'Todavía no hay aparatos registrados.' : 'Sin conexión con el medidor de la casa.'}</Vacio>
  }
  const semana = energiaSemana.datos
  const dias = semana ? Math.max(1, (Date.now() - Date.parse(semana.desde)) / DIA_MS) : null
  const resto = restoDelDia(ia?.prediccion)
  const semanaIA = semanaPrevista(ia?.prediccion)
  // Último aviso de consumo (alto o bajo) de cada aparato en las últimas 24 horas
  const avisoDe = {}
  for (const a of ia?.alertas || []) {
    if (TIPOS_RESIDENTE.has(a.tipo) && Date.parse(a.inicio) >= Date.now() - VIGENCIA_AVISO_MS && !avisoDe[a.nodo]) avisoDe[a.nodo] = a
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Lo que cuesta cada aparato a {fmtMoneda(tarifaKwh)} el kWh. Puedes cambiar la tarifa y los nombres en Ajustes.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 md:gap-5">
        {nodos.map((n) => {
          const estado = estadoResidente(n)
          const hoy = energiaHoy.datos?.nodos?.[n.id]
          const kwhSemana = semana?.nodos?.[n.id]
          const diario = kwhSemana != null && dias ? kwhSemana / dias : null
          const finDia = hoy != null && resto ? hoy + (resto.porNodo[n.id] || 0) : null
          const aviso = avisoDe[n.id]
          const semanaNodo = semanaIA ? semanaIA.porNodo[n.id] : null
          return (
            <article key={n.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-start gap-2.5">
                  <PuntoAparato color={n.color} className="mt-2" />
                  <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 truncate">{n.nombreBase}</h2>
                  {n.ubicacion && <p className="text-[13px] text-slate-500 truncate">{n.ubicacion}</p>}
                  </div>
                </div>
                <EstadoTexto tono={estado.tono}>{estado.texto}</EstadoTexto>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100">
                <Cifra titulo="Hoy" valor={hoy == null ? '--' : fmtMoneda(hoy * tarifaKwh)} nota={hoy == null ? null : `${fmtNumero(hoy, 2)} kWh`} />
                <Cifra titulo="Por día" valor={diario == null ? '--' : fmtMoneda(diario * tarifaKwh)} nota="promedio" />
                <Cifra titulo="Al mes" valor={diario == null ? '--' : fmtMoneda(diario * 30 * tarifaKwh)} nota="estimado" />
              </div>
              {(finDia != null || semanaNodo != null) && (
                <p className="text-[13px] text-slate-600 mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-slate-400 -mr-2.5"><Icono nombre="ia" className="w-4 h-4" /></span>
                  {finDia != null && (
                    <span>Al final del día: <span className="font-semibold text-slate-900">~{fmtMoneda(finDia * tarifaKwh)}</span></span>
                  )}
                  {semanaNodo != null && (
                    <span>Próximos 7 días: <span className="font-semibold text-slate-900">~{fmtMoneda(semanaNodo * tarifaKwh)}</span></span>
                  )}
                </p>
              )}
              {aviso && (
                <p className="text-[13px] text-slate-700 mt-3 pl-2.5 border-l-[3px] border-amber-500">
                  {conPunto(`${aviso.tipo === 'consumo_alto' ? 'Consumió más de lo normal' : 'Consumió mucho menos de lo normal'} ${diaRelativo(Date.parse(aviso.inicio)).toLowerCase()} ${franja(aviso)}`)}
                </p>
              )}
              {estado.texto === 'En pausa' && (
                <p className="text-[13px] text-slate-500 mt-4">Es normal: la nevera apaga el motor cuando ya está fría.</p>
              )}
              {estado.tono === 'falla' && (
                <p className="text-[13px] text-amber-700 mt-4">El medidor de este aparato no envía datos. Revisa que esté enchufado.</p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
