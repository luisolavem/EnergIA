// Inicio de sesión: una tarjeta centrada, igual en celular y en computador.
import { useState } from 'react'
import { Marca, claseEtiqueta, claseInput } from '../components/ui.jsx'
import { URL_BACKEND_POR_DEFECTO, limpiarUrl } from '../config.js'
import { useAuth } from '../context/AuthContext.jsx'

function hostDe(url) {
  try { return new URL(url).host } catch { return url }
}

export default function Login({ urlBackend, onCambiarServidor }) {
  const { iniciarSesion, aviso } = useAuth()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [recordar, setRecordar] = useState(true)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [editandoServidor, setEditandoServidor] = useState(false)
  const [servidor, setServidor] = useState(urlBackend)

  const enviar = async (e) => {
    e.preventDefault()
    if (!correo.trim() || !contrasena) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await iniciarSesion(correo, contrasena, recordar)
    } catch (err) {
      if (err.estado === 401 || err.estado === 429) setError(err.message)
      else if (err.estado) setError(`El servidor respondió con un error (${err.estado}). Inténtalo de nuevo.`)
      else setError(`No hay conexión con el servidor en ${hostDe(urlBackend)}. Revisa que estés en el WiFi de la casa.`)
      setContrasena('')
    } finally {
      setEnviando(false)
    }
  }

  const guardarServidor = () => {
    onCambiarServidor(limpiarUrl(servidor) || URL_BACKEND_POR_DEFECTO)
    setEditandoServidor(false)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <form onSubmit={enviar} className="bg-white rounded-2xl border border-slate-200/70 p-7 sm:p-8" noValidate>
          <Marca tamano="grande" />
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mt-7">Entra para ver el consumo de tu casa</h1>
          <p className="text-sm text-slate-500 mt-1.5">Usa la cuenta que te dio el equipo del proyecto.</p>

          {(error || aviso) && (
            <p role="alert" className={`mt-5 text-[13px] px-3 py-2.5 rounded-xl border ${error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {error || aviso}
            </p>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <label className={claseEtiqueta} htmlFor="login-correo">Correo</label>
              <input
                id="login-correo"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className={claseInput}
              />
            </div>
            <div>
              <label className={claseEtiqueta} htmlFor="login-contrasena">Contraseña</label>
              <input
                id="login-contrasena"
                type="password"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                className={claseInput}
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-primario-600"
            />
            Mantener la sesión en este equipo
          </label>

          <button
            type="submit"
            disabled={enviando}
            className="mt-6 w-full py-3 rounded-xl text-sm font-semibold btn-principal bg-primario-600 text-white hover:bg-primario-700 disabled:opacity-60 transition-colors"
          >
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="mt-5 text-[13px] text-slate-500">
            ¿Olvidaste la contraseña? Pídele al equipo técnico que la restablezca.
          </p>
        </form>

        <div className="mt-4 text-center text-[13px] text-slate-500">
          {editandoServidor ? (
            <div className="flex gap-2">
              <input
                value={servidor}
                onChange={(e) => setServidor(e.target.value)}
                aria-label="Dirección del servidor"
                className={`${claseInput} py-2 text-[13px]`}
                placeholder="192.168.1.28:8000"
              />
              <button onClick={guardarServidor} className="px-3 rounded-xl bg-slate-200 text-slate-700 font-medium hover:bg-slate-300">Usar</button>
            </div>
          ) : (
            <p>
              Servidor <span className="num">{hostDe(urlBackend)}</span>{' '}
              <button onClick={() => setEditandoServidor(true)} className="text-primario-700 font-medium hover:underline">Cambiar</button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
