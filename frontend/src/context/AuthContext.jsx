// Sesión del usuario: quién entró, con qué rol y su token.
//   - "Mantener la sesión" guarda el token en localStorage (sobrevive al cerrar
//     el navegador); si no, en sessionStorage (se borra al cerrar la pestaña).
//   - Al abrir la app se verifica el token guardado con GET /api/auth/yo.
//   - Si el backend responde 401 (sesión vencida o cuenta desactivada), se
//     vuelve a la pantalla de inicio de sesión con un aviso.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, registrarSesion } from '../lib/api.js'

const CLAVE = 'energia.sesion'
const AuthContext = createContext(null)

function leerGuardada() {
  for (const almacen of [localStorage, sessionStorage]) {
    try {
      const s = JSON.parse(almacen.getItem(CLAVE) || 'null')
      if (s?.token) return s
    } catch { /* almacenamiento no disponible */ }
  }
  return null
}

function guardar(sesion, recordar) {
  try {
    localStorage.removeItem(CLAVE)
    sessionStorage.removeItem(CLAVE)
    if (sesion) (recordar ? localStorage : sessionStorage).setItem(CLAVE, JSON.stringify(sesion))
  } catch { /* modo privado: la sesión dura mientras la pestaña esté abierta */ }
}

export function AuthProvider({ urlBackend, children }) {
  const [sesion, setSesion] = useState(leerGuardada)          // { token, usuario }
  const [verificando, setVerificando] = useState(() => Boolean(leerGuardada()))
  const [aviso, setAviso] = useState(null)                     // mensaje para la pantalla de login

  const cerrarSesion = useCallback((mensaje = null) => {
    guardar(null)
    registrarSesion(null, null)
    setSesion(null)
    setAviso(mensaje)
  }, [])

  // El token se registra antes de que los hijos hagan peticiones.
  registrarSesion(sesion?.token || null, () => cerrarSesion('Tu sesión venció. Vuelve a entrar.'))

  // Verifica la sesión guardada al abrir la app o al cambiar de servidor.
  useEffect(() => {
    const guardada = leerGuardada()
    if (!guardada) { setVerificando(false); return undefined }
    let vigente = true
    setVerificando(true)
    api.yo(urlBackend)
      .then((r) => {
        if (!vigente) return
        const recordar = Boolean(localStorage.getItem(CLAVE))
        const nueva = { token: guardada.token, usuario: r.usuario }
        guardar(nueva, recordar)
        setSesion(nueva)
      })
      .catch((e) => {
        // 401: el token ya no sirve. Otro error (servidor apagado): se conserva
        // la sesión y la app mostrará "sin conexión" hasta que vuelva.
        if (vigente && e.estado === 401) cerrarSesion('Tu sesión venció. Vuelve a entrar.')
      })
      .finally(() => vigente && setVerificando(false))
    return () => { vigente = false }
  }, [urlBackend, cerrarSesion])

  const iniciarSesion = useCallback(async (correo, contrasena, recordar) => {
    const r = await api.login(urlBackend, correo.trim(), contrasena, recordar)
    const nueva = { token: r.token, usuario: r.usuario }
    guardar(nueva, recordar)
    registrarSesion(nueva.token, () => cerrarSesion('Tu sesión venció. Vuelve a entrar.'))
    setAviso(null)
    setSesion(nueva)
  }, [urlBackend, cerrarSesion])

  // Al cambiar la contraseña el backend entrega un token nuevo (los demás dejan de servir).
  const reemplazarToken = useCallback((token) => {
    setSesion((prev) => {
      const nueva = { ...prev, token }
      guardar(nueva, Boolean(localStorage.getItem(CLAVE)))
      return nueva
    })
  }, [])

  const valor = useMemo(() => ({
    token: sesion?.token || null,
    usuario: sesion?.usuario || null,
    verificando,
    aviso,
    iniciarSesion,
    cerrarSesion,
    reemplazarToken,
  }), [sesion, verificando, aviso, iniciarSesion, cerrarSesion, reemplazarToken])

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
