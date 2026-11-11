// Formatos de números, fechas y duraciones (Colombia).
const LOCALE = 'es-CO'

export function fmtNumero(valor, decimales = 1) {
  if (valor == null || !Number.isFinite(Number(valor))) return '--'
  return Number(valor).toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

// Preferencia del técnico (menú del perfil): mostrar la potencia siempre en kW.
let potenciaEnKw = false
export function usarPotenciaEnKw(valor) { potenciaEnKw = Boolean(valor) }

// 850 W -> "850 W", 1530 W -> "1,53 kW" (o siempre kW si se eligió en el perfil)
export function fmtPotencia(vatios) {
  if (vatios == null || !Number.isFinite(vatios)) return '--'
  if (potenciaEnKw) return `${fmtNumero(vatios / 1000, vatios < 100 ? 3 : 2)} kW`
  return vatios >= 1000 ? `${fmtNumero(vatios / 1000, 2)} kW` : `${fmtNumero(vatios, 0)} W`
}

export function fmtMoneda(valor) {
  if (valor == null || !Number.isFinite(valor)) return '--'
  return valor.toLocaleString(LOCALE, { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

// Saludo según la hora del día
export function saludo(ahora = new Date()) {
  const h = ahora.getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function fmtHora(ms, conSegundos = false) {
  if (!ms) return '--'
  return new Date(ms).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    ...(conSegundos ? { second: '2-digit' } : {}),
  })
}

export function fmtFechaHora(ms) {
  if (!ms) return '--'
  return new Date(ms).toLocaleString(LOCALE, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function fechaLarga() {
  const texto = new Date().toLocaleDateString(LOCALE, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function fmtDuracion(segundos) {
  if (segundos == null || !Number.isFinite(segundos)) return '--'
  const s = Math.max(0, Math.floor(segundos))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min`
  return `${s} s`
}

export function fmtHaceCuanto(ms, ahora = Date.now()) {
  if (!ms) return '--'
  const segundos = (ahora - ms) / 1000
  return segundos < 5 ? 'justo ahora' : `hace ${fmtDuracion(segundos)}`
}

export const MOTIVOS_REINICIO = {
  encendido: 'Encendido (volvió la energía)',
  caida_tension: 'Caída de tensión',
  software: 'Reinicio por software',
  error: 'Error del firmware',
  watchdog: 'Watchdog',
  externo: 'Botón de reinicio',
  reconexion: 'Reconexión de red',
  recuperacion_red: 'Recuperación automática de la red (v2)',
  otro: 'Otro',
}

export function calidadSenal(rssi) {
  if (rssi == null) return null
  if (rssi >= -60) return 'Excelente'
  if (rssi >= -70) return 'Buena'
  if (rssi >= -80) return 'Débil'
  return 'Muy débil'
}
