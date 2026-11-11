// Avisos de la IA para el residente: solo consumo alto o bajo, en pesos y
// en palabras sencillas. "Entendido" los oculta en este navegador.
import { useState } from 'react'
import { TIPOS_RESIDENTE, guardarVistos, leerVistos, mensajeResidente } from '../lib/ia.js'
import { Icono, PuntoAparato, claseTarjeta } from './ui.jsx'

const VIGENCIA_MS = 48 * 3_600_000   // se muestran los de las últimas 48 horas
const MAXIMO = 3

export default function AvisosIA({ alertas = [], nodos = [], tarifaKwh }) {
  const [vistos, setVistos] = useState(leerVistos)
  const desde = Date.now() - VIGENCIA_MS
  const visibles = alertas
    .filter((a) => TIPOS_RESIDENTE.has(a.tipo) && Date.parse(a.inicio) >= desde && !vistos.has(a.id))
    .slice(0, MAXIMO)
  if (visibles.length === 0) return null

  const marcar = (ids) => {
    const siguiente = new Set([...vistos, ...ids])
    guardarVistos(siguiente)
    setVistos(siguiente)
  }

  return (
    <section className={`${claseTarjeta} border-l-[3px] border-l-amber-500 p-4 md:p-5`} aria-label="Avisos de consumo">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-900 inline-flex items-center gap-2">
          <span className="text-amber-600"><Icono nombre="alerta" /></span>
          {visibles.length === 1 ? 'Un aparato se salió de lo normal' : `${visibles.length} avisos de consumo`}
        </h2>
        {visibles.length > 1 && (
          <button type="button" onClick={() => marcar(visibles.map((a) => a.id))}
            className="text-[13px] font-medium text-slate-500 hover:text-slate-800 flex-shrink-0">
            Ocultar todos
          </button>
        )}
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {visibles.map((a) => {
          const nodo = nodos.find((n) => n.id === a.nodo)
          return (
            <li key={a.id} className="py-2.5 flex items-start gap-3">
              <PuntoAparato color={nodo?.color || '#94a3b8'} className="mt-1.5" />
              <p className="flex-1 text-sm text-slate-700">{mensajeResidente(a, nodo?.nombre || a.aparato, tarifaKwh)}</p>
              <button type="button" onClick={() => marcar([a.id])}
                className="text-[13px] font-medium text-primario-700 hover:text-primario-800 flex-shrink-0">
                Entendido
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-slate-500 mt-2 inline-flex items-center gap-1">
        <Icono nombre="ia" className="w-3.5 h-3.5" />
        Detectado por la IA comparando con lo normal de cada aparato a esa hora.
      </p>
    </section>
  )
}
