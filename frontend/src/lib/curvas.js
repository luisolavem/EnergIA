// Curvas pequeñas (sparklines) de los últimos minutos para tarjetas y filas.
// Los huecos sin lecturas (aparato apagado o nodo caído) cortan la línea:
// nunca se inventan valores entre dos lecturas.
import { RESOLUCION_GRAFICA_MS, VENTANA_TIEMPO_REAL_MIN } from '../config.js'

const HUECO_MS = 30_000

// Devuelve { linea, area, pico } en coordenadas de un viewBox ancho x alto.
export function curvaPotencia(puntos = [], ahora = Date.now(), ancho = 200, alto = 40) {
  const desde = ahora - VENTANA_TIEMPO_REAL_MIN * 60 * 1000
  const visibles = puntos.filter((p) => p.t >= desde && p.t <= ahora + 5000 && p.potencia != null)
  if (visibles.length < 2) return { linea: '', area: '', pico: visibles[0]?.potencia ?? null }
  const pico = Math.max(...visibles.map((p) => p.potencia), 1)
  const x = (t) => ((t - desde) / (ahora - desde)) * ancho
  const y = (v) => alto - 2 - (v / pico) * (alto - 6)
  let linea = ''
  let area = ''
  let tramo = []
  const cerrarTramo = () => {
    if (tramo.length > 1) {
      linea += tramo.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.potencia).toFixed(1)}`).join('')
      area += `M${x(tramo[0].t).toFixed(1)},${alto}` +
        tramo.map((p) => `L${x(p.t).toFixed(1)},${y(p.potencia).toFixed(1)}`).join('') +
        `L${x(tramo[tramo.length - 1].t).toFixed(1)},${alto}Z`
    }
    tramo = []
  }
  visibles.forEach((p, i) => {
    if (i && p.t - visibles[i - 1].t > Math.max(HUECO_MS, RESOLUCION_GRAFICA_MS * 3)) cerrarTramo()
    tramo.push(p)
  })
  cerrarTramo()
  return { linea, area, pico }
}
