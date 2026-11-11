// Combina lecturas, estado de conexión, estado de carga y metadatos de cada
// nodo en un solo objeto listo para mostrar. Aquí se decide qué es "verdad".
import { COLORES_NODOS, LECTURA_VIGENTE_MS } from '../config.js'

export const ESTADO = {
  ACTIVO: 'activo',             // conectado y midiendo un aparato encendido
  SIN_CARGA: 'sin_carga',       // conectado, aparato apagado (no envía lecturas)
  SIN_DATOS: 'sin_datos',       // no hay información reciente confiable
  DESCONECTADO: 'desconectado', // el broker confirmó que el nodo se cayó
}

export const estaEnLinea = (nodo) => nodo.estado === ESTADO.ACTIVO || nodo.estado === ESTADO.SIN_CARGA

const esNevera = (nodo) => /nevera|refri|congelador/i.test(nodo.nombre)

// Estado en palabras para el residente: "sin carga" suena a falla, y una
// nevera que apaga el motor está funcionando bien.
export function estadoResidente(nodo) {
  switch (nodo.estado) {
    case ESTADO.ACTIVO:
      return { texto: esNevera(nodo) ? 'Enfriando' : 'Encendido', tono: 'ok' }
    case ESTADO.SIN_CARGA:
      return { texto: esNevera(nodo) ? 'En pausa' : 'Apagado', tono: 'neutro' }
    default:
      return { texto: 'Sin conexión', tono: 'falla' }
  }
}

export function nombrePorDefecto(id) {
  const m = /^nodo[_-]?(\d+)$/i.exec(id)
  return m ? `Nodo ${m[1]}` : id
}

// Color fijo por nodo: nodo_1 siempre usa el primero, nodo_2 el segundo, etc.
function colorDe(id, indice) {
  const m = /(\d+)$/.exec(id)
  const i = m ? Number(m[1]) - 1 : indice
  const n = COLORES_NODOS.length
  return COLORES_NODOS[((i % n) + n) % n]
}

export function calcularEstado({ lectura, estado, carga }, ahora) {
  if (estado?.estado === 'offline') return ESTADO.DESCONECTADO
  if (carga?.carga === 'reposo') return ESTADO.SIN_CARGA
  const tsLectura = lectura ? Date.parse(lectura.timestamp) : 0
  if (tsLectura && ahora - tsLectura < LECTURA_VIGENTE_MS) return ESTADO.ACTIVO
  if (estado?.estado === 'online') {
    // Conectado pero sin lecturas: normal si está en reposo; raro si dice "activa".
    return carga?.carga === 'activa' ? ESTADO.SIN_DATOS : ESTADO.SIN_CARGA
  }
  return ESTADO.SIN_DATOS
}

export function construirNodos({ lecturas = {}, estados = {}, cargas = {}, metadatos = {} }, ahora) {
  const ids = new Set([
    ...Object.keys(lecturas), ...Object.keys(estados),
    ...Object.keys(cargas), ...Object.keys(metadatos),
  ])
  // Dos aparatos con el mismo nombre (dos neveras) se distinguen por su ubicación.
  const nombreBaseDe = (id) => metadatos[id]?.nombre?.trim() || nombrePorDefecto(id)
  const repeticiones = {}
  for (const id of ids) repeticiones[nombreBaseDe(id)] = (repeticiones[nombreBaseDe(id)] || 0) + 1

  return [...ids]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .map((id, indice) => {
      const lectura = lecturas[id]
      const infoEstado = estados[id]
      const infoCarga = cargas[id]
      const meta = metadatos[id] || {}
      const estado = calcularEstado({ lectura, estado: infoEstado, carga: infoCarga }, ahora)
      const activo = estado === ESTADO.ACTIVO
      const sinCarga = estado === ESTADO.SIN_CARGA
      return {
        id,
        nombreBase: nombreBaseDe(id),
        // Nombre para mostrar: "Nevera (Cocina 2)" si hay otro aparato con el mismo nombre
        nombre: repeticiones[nombreBaseDe(id)] > 1 && meta.ubicacion?.trim()
          ? `${nombreBaseDe(id)} (${meta.ubicacion.trim()})`
          : nombreBaseDe(id),
        ubicacion: meta.ubicacion?.trim() || '',
        color: colorDe(id, indice),
        estado,
        // Valores "actuales": solo se muestran si son verdad en este momento.
        potencia: activo ? lectura.potencia : sinCarga ? 0 : null,
        corriente: activo ? lectura.corriente : sinCarga ? 0 : null,
        voltaje: activo ? lectura.voltaje : null,
        tsUltimaLectura: lectura ? Date.parse(lectura.timestamp) : null,
        ultimaLectura: lectura || null,
        infoEstado: infoEstado || null,
        infoCarga: infoCarga || null,
      }
    })
}
