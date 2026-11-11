// Llamadas HTTP al backend (FastAPI).
// El token de la sesión se registra una vez (AuthContext) y se agrega solo a
// cada petición. Si el backend responde 401 con una sesión abierta, se avisa
// para volver a la pantalla de inicio de sesión.
import { limpiarUrl } from '../config.js'

let tokenActual = null
let alVencerSesion = null

export function registrarSesion(token, onVencida) {
  tokenActual = token
  alVencerSesion = onVencida
}

export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje)
    this.estado = estado
  }
}

async function pedir(urlBackend, ruta, opciones = {}) {
  const cabeceras = { 'Content-Type': 'application/json' }
  if (tokenActual) cabeceras.Authorization = `Bearer ${tokenActual}`
  const respuesta = await fetch(`${limpiarUrl(urlBackend)}${ruta}`, { ...opciones, headers: cabeceras })
  if (!respuesta.ok) {
    let detalle = `HTTP ${respuesta.status}`
    try { detalle = (await respuesta.json()).detail || detalle } catch { /* sin cuerpo JSON */ }
    if (respuesta.status === 401 && tokenActual && alVencerSesion) alVencerSesion()
    throw new ErrorApi(respuesta.status, typeof detalle === 'string' ? detalle : `HTTP ${respuesta.status}`)
  }
  return respuesta.json()
}

const nodo = (id) => encodeURIComponent(id)
const json = (datos) => JSON.stringify(datos)

export const api = {
  salud: (url) => pedir(url, '/'),

  // Sesión
  login: (url, correo, contrasena, recordar) =>
    pedir(url, '/api/auth/login', { method: 'POST', body: json({ correo, contrasena, recordar }) }),
  yo: (url) => pedir(url, '/api/auth/yo'),
  cambiarContrasena: (url, actual, nueva) =>
    pedir(url, '/api/auth/cambiar-contrasena', { method: 'POST', body: json({ actual, nueva }) }),

  // Cuentas (solo técnico)
  usuarios: (url) => pedir(url, '/api/usuarios'),
  crearUsuario: (url, datos) => pedir(url, '/api/usuarios', { method: 'POST', body: json(datos) }),
  modificarUsuario: (url, id, cambios) => pedir(url, `/api/usuarios/${id}`, { method: 'PATCH', body: json(cambios) }),
  restablecerContrasena: (url, id, contrasena) =>
    pedir(url, `/api/usuarios/${id}/contrasena`, { method: 'POST', body: json({ contrasena }) }),

  // Datos
  historico: (url, id, desde = '-30m', ventana = '10s') =>
    pedir(url, `/api/nodes/${nodo(id)}/historico?desde=${desde}&ventana=${ventana}`),
  energia: (url, periodo = 'hoy') => pedir(url, `/api/energia?periodo=${periodo}`),
  eventos: (url, limite = 50) => pedir(url, `/api/eventos?limite=${limite}`),
  metadatos: (url) => pedir(url, '/api/nodes/meta'),
  guardarMetadatos: (url, id, datos) =>
    pedir(url, `/api/nodes/${nodo(id)}/meta`, { method: 'PUT', body: json(datos) }),
  configNodo: (url, id) => pedir(url, `/api/nodes/${nodo(id)}/config`),
  guardarConfigNodo: (url, id, cfg) =>
    pedir(url, `/api/nodes/${nodo(id)}/config`, { method: 'PUT', body: json(cfg) }),

  // Modelos de IA (backend v0.4)
  prediccion: (url) => pedir(url, '/api/prediccion'),
  alertas: (url, limite = 300, dias = 30) => pedir(url, `/api/alertas?limite=${limite}&dias=${dias}`),
  modelos: (url) => pedir(url, '/api/modelos'),
  recargarModelos: (url) => pedir(url, '/api/modelos/recargar', { method: 'POST' }),
}
