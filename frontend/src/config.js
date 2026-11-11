// Configuración central de la interfaz.

const PUERTO_BACKEND = 8000

// Dirección del backend, en orden de prioridad:
//   1) la guardada en el navegador (Configuración o pantalla de inicio de sesión),
//   2) VITE_API_URL del archivo .env.local,
//   3) el mismo equipo que sirve la página, puerto 8000.
export const URL_BACKEND_POR_DEFECTO =
  import.meta.env.VITE_API_URL || `http://${window.location.hostname}:${PUERTO_BACKEND}`

export const TARIFA_KWH_POR_DEFECTO = 850 // COP por kWh, editable en Ajustes

export const VENTANA_TIEMPO_REAL_MIN = 30   // minutos visibles en las gráficas
export const RESOLUCION_GRAFICA_MS = 10_000 // agrupación de puntos en las gráficas
export const LECTURA_VIGENTE_MS = 30_000    // una lectura más vieja ya no es "actual"
export const MAX_LECTURAS_LOG = 200
export const MAX_EVENTOS_BITACORA = 200

// Rango que puede medir el PZEM-004T v3. Fuera de él la lectura es un error
// del sensor y no se muestra (el backend tampoco la guarda).
export const RANGO_SENSOR = { voltaje: [80, 260], corriente: [0, 100], potencia: [0, 23_000] }

// Menú de cada rol (id, texto del menú, título de la cabecera, texto corto en celular)
export const SECCIONES = {
  residente: [
    { id: 'inicio', etiqueta: 'Inicio', titulo: 'Inicio' },
    { id: 'aparatos', etiqueta: 'Mis aparatos', titulo: 'Mis aparatos', corto: 'Aparatos' },
    { id: 'ajustes', etiqueta: 'Ajustes', titulo: 'Ajustes' },
  ],
  tecnico: [
    { id: 'panel', etiqueta: 'Panel técnico', titulo: 'Panel técnico', corto: 'Panel' },
    { id: 'nodos', etiqueta: 'Nodos', titulo: 'Nodos' },
    { id: 'alertas', etiqueta: 'Alertas IA', titulo: 'Alertas IA', corto: 'Alertas' },
    { id: 'registros', etiqueta: 'Registros', titulo: 'Eventos y registros' },
    { id: 'inicio', etiqueta: 'Vista del residente', titulo: 'Vista del residente', corto: 'Residente' },
  ],
}

// Variables que puede mostrar una gráfica
export const METRICAS = {
  potencia: { etiqueta: 'Potencia', unidad: 'W', decimales: 0 },
  voltaje: { etiqueta: 'Voltaje', unidad: 'V', decimales: 1 },
  corriente: { etiqueta: 'Corriente', unidad: 'A', decimales: 2 },
}

// Temas de color (los valores reales están en index.css).
// "muestra" son los colores del círculo de vista previa en Configuración;
// "grafica" son colores que recharts necesita como valor fijo.
const GRAFICA_CLARA = { rejilla: '#e2e8f0', eje: '#94a3b8', vacio: '#f1f5f9' }
export const TEMAS = [
  { id: 'cian', nombre: 'Esmeralda y cian', descripcion: 'El tema predeterminado, claro',
    muestra: ['#22d3ee', '#10b981', '#f8fafc'], grafica: GRAFICA_CLARA },
  { id: 'indigo', nombre: 'Índigo', descripcion: 'Violetas sobrios',
    muestra: ['#818cf8', '#8b5cf6', '#f8fafc'], grafica: GRAFICA_CLARA },
  { id: 'ambar', nombre: 'Ámbar', descripcion: 'Tonos cálidos de alto contraste',
    muestra: ['#fbbf24', '#f97316', '#f8fafc'], grafica: GRAFICA_CLARA },
  { id: 'oscuro', nombre: 'Oscuro', descripcion: 'Fondo oscuro para la noche',
    muestra: ['#22d3ee', '#34d399', '#020617'], grafica: { rejilla: '#334155', eje: '#94a3b8', vacio: '#1e293b' } },
]
export const TEMA_POR_DEFECTO = 'cian'

// Un color fijo por aparato, validado para daltonismo y contraste:
// nevera 1, nevera 2, router, computador, TV (y dos de reserva).
export const COLORES_NODOS = ['#0891b2', '#16a34a', '#6366f1', '#d97706', '#db2777', '#0ea5e9', '#84cc16']

// Acepta "192.168.1.28:8000", "http://..." o "ws://..." y devuelve http(s)://host:puerto
export function limpiarUrl(url) {
  let u = (url || '').trim().replace(/\/+$/, '')
  if (!u) return ''
  u = u.replace(/^ws(s?):\/\//i, 'http$1://')
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u.replace(/\/ws\/nodes$/, '')
}

// El navegador no permite cabeceras en un WebSocket: el token va en la dirección.
export function urlWebSocket(urlBackend, token) {
  const base = `${limpiarUrl(urlBackend).replace(/^http(s?):\/\//i, 'ws$1://')}/ws/nodes`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}
