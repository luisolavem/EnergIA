// Utilidades para mostrar la predicción y las alertas de los modelos de IA.
// La predicción llega por aparato ("Nevera1") y aquí se pasa a id de nodo
// ("nodo_1"), que es como el resto de la interfaz identifica a cada aparato.
import { fmtMoneda, fmtNumero } from './formato.js'

const HORA_MS = 3_600_000

// Tipos de alerta que ve el residente; los demás son diagnóstico para el técnico.
export const TIPOS_RESIDENTE = new Set(['consumo_alto', 'consumo_bajo'])

export const TIPOS_ALERTA = {
  consumo_alto: { texto: 'Consumo alto', tono: 'falla' },
  consumo_bajo: { texto: 'Consumo bajo', tono: 'aviso' },
  arranques: { texto: 'Muchos arranques', tono: 'aviso' },
  potencia: { texto: 'Potencia distinta', tono: 'aviso' },
  inusual: { texto: 'Patrón inusual', tono: 'neutro' },
}

const nodoDe = (prediccion) =>
  Object.fromEntries((prediccion?.aparatos || []).map((a) => [a.aparato, a.nodo || a.aparato]))

// Horas previstas: [{ t, valores: { nodo_1: kWh, ... }, total }]
export function horasPrevistas(prediccion) {
  if (!prediccion?.disponible) return []
  const mapa = nodoDe(prediccion)
  return (prediccion.horas || []).map((h) => {
    const valores = {}
    for (const [aparato, kwh] of Object.entries(h.aparatos || {})) valores[mapa[aparato] || aparato] = kwh
    return { t: Date.parse(h.inicio), valores, total: h.total_kwh ?? Object.values(valores).reduce((a, b) => a + b, 0) }
  })
}

// Próximos 7 días (hoy con lo ya consumido + los 6 días siguientes), por día y por nodo.
// Devuelve null si el backend todavía tiene los modelos de 24 horas.
export function semanaPrevista(prediccion) {
  const semana = prediccion?.disponible ? prediccion.semana : null
  if (!semana?.dias?.length) return null
  const mapa = nodoDe(prediccion)
  const dias = semana.dias.map((d) => {
    const valores = {}
    for (const [aparato, kwh] of Object.entries(d.aparatos || {})) valores[mapa[aparato] || aparato] = kwh
    // "2026-11-11" en hora local (sin pasar por UTC)
    const [y, m, dd] = d.fecha.split('-').map(Number)
    return { t: new Date(y, m - 1, dd).getTime(), kwh: d.kwh, valores, hoy: d.incluye_consumido }
  })
  const porNodo = {}
  for (const d of dias) for (const [n, kwh] of Object.entries(d.valores)) porNodo[n] = (porNodo[n] || 0) + kwh
  return { dias, total: semana.total_kwh, porNodo, error: semana.error_esperado_pct }
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const nombreDia = (t, esHoy) => (esHoy ? 'Hoy' : DIAS_CORTOS[new Date(t).getDay()])

// kWh que la IA espera desde ahora hasta la medianoche, total y por nodo.
// De la hora en curso solo se cuenta la parte que falta (lo demás ya está
// en el consumo medido de hoy).
export function restoDelDia(prediccion, ahora = Date.now()) {
  const horas = horasPrevistas(prediccion)
  if (!horas.length) return null
  const inicioHora = new Date(ahora).setMinutes(0, 0, 0)
  const manana = new Date(ahora).setHours(24, 0, 0, 0)
  const falta = 1 - (ahora - inicioHora) / HORA_MS
  const porNodo = {}
  let total = 0
  for (const h of horas) {
    if (h.t < inicioHora || h.t >= manana) continue
    const peso = h.t === inicioHora ? falta : 1
    for (const [nodo, kwh] of Object.entries(h.valores)) {
      porNodo[nodo] = (porNodo[nodo] || 0) + kwh * peso
      total += kwh * peso
    }
  }
  return { total, porNodo }
}

const fmtHoraCorta = (ms) =>
  new Date(ms).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })

// "entre las 3:00 p. m. y las 4:00 p. m."
export function franja(alerta) {
  return `entre las ${fmtHoraCorta(Date.parse(alerta.inicio))} y las ${fmtHoraCorta(Date.parse(alerta.fin))}`
}

// Día relativo: "Hoy", "Ayer" o "lun 9 nov"
export function diaRelativo(ms, ahora = Date.now()) {
  const dia = new Date(ms).setHours(0, 0, 0, 0)
  const hoy = new Date(ahora).setHours(0, 0, 0, 0)
  if (dia === hoy) return 'Hoy'
  if (dia === hoy - 86_400_000) return 'Ayer'
  return new Date(ms).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Agrega el punto final sin duplicarlo ("... 4:00 p. m." ya termina en punto)
export const conPunto = (texto) => (texto.endsWith('.') ? texto : `${texto}.`)

// Mensaje para el residente, en pesos y sin términos técnicos.
export function mensajeResidente(alerta, nombre, tarifaKwh) {
  const cuando = `${diaRelativo(Date.parse(alerta.inicio)).toLowerCase()} ${franja(alerta)}`
  if (alerta.tipo === 'consumo_alto') {
    const normal = alerta.normal_kwh != null ? ` (lo normal a esa hora es ${fmtMoneda(alerta.normal_kwh * tarifaKwh)})` : ''
    return `${nombre} consumió más de lo normal ${cuando}: ${fmtMoneda(alerta.kwh * tarifaKwh)}${normal}.`
  }
  if (alerta.tipo === 'consumo_bajo') {
    return `${conPunto(`${nombre} consumió mucho menos de lo normal ${cuando}`)} ¿Quedó apagado o desconectado?`
  }
  return conPunto(`${nombre} tuvo un comportamiento poco común ${cuando}`)
}

export const fmtWh = (kwh) => (kwh == null ? '--' : `${fmtNumero(kwh * 1000, 0)} Wh`)

// Avisos que el residente ya marcó como vistos (solo en este navegador)
const CLAVE_VISTOS = 'energia.avisosIA.vistos'

export function leerVistos() {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTOS) || '[]')) } catch { return new Set() }
}

export function guardarVistos(vistos) {
  try { localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...vistos].slice(-200))) } catch { /* modo privado */ }
}
