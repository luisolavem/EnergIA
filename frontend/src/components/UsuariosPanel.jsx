// Cuentas de usuario (pestaña de Configuración, solo técnico).
// Crear cuentas, cambiar el rol, desactivar y restablecer contraseñas.
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { fmtFechaHora } from '../lib/formato.js'
import { Mensaje, claseBotonPrincipal, claseEtiqueta, claseInput } from './ui.jsx'

const VACIA = { correo: '', nombre: '', rol: 'residente', contrasena: '' }

function FilaUsuario({ u, esYo, urlBackend, onCambio, setMensaje }) {
  const [restableciendo, setRestableciendo] = useState(false)
  const [clave, setClave] = useState('')

  const modificar = async (cambios, texto) => {
    try {
      await api.modificarUsuario(urlBackend, u.id, cambios)
      setMensaje({ tipo: 'ok', texto })
      onCambio()
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const restablecer = async () => {
    if (clave.length < 8) { setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' }); return }
    try {
      await api.restablecerContrasena(urlBackend, u.id, clave)
      setMensaje({ tipo: 'ok', texto: `Contraseña de ${u.nombre} restablecida. Sus sesiones abiertas se cerraron.` })
      setRestableciendo(false)
      setClave('')
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold truncate ${u.activo ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
            {u.nombre}{esYo && <span className="font-normal text-slate-500"> (tú)</span>}
          </p>
          <p className="text-[13px] text-slate-500 truncate">
            {u.correo}. Último acceso: {u.ultimo_acceso ? fmtFechaHora(Date.parse(u.ultimo_acceso)) : 'nunca'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={u.rol}
            disabled={esYo}
            onChange={(e) => modificar({ rol: e.target.value }, `${u.nombre} ahora es ${e.target.value === 'tecnico' ? 'técnico' : 'residente'}.`)}
            aria-label={`Rol de ${u.nombre}`}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[13px] disabled:opacity-60"
          >
            <option value="residente">Residente</option>
            <option value="tecnico">Técnico</option>
          </select>
          <button type="button" onClick={() => setRestableciendo((v) => !v)} className="px-2.5 py-1.5 rounded-lg text-[13px] text-slate-700 hover:bg-slate-100">
            Contraseña
          </button>
          {!esYo && (
            <button
              type="button"
              onClick={() => modificar({ activo: !u.activo }, `Cuenta de ${u.nombre} ${u.activo ? 'desactivada' : 'activada'}.`)}
              className={`px-2.5 py-1.5 rounded-lg text-[13px] ${u.activo ? 'text-red-700 hover:bg-red-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
            >
              {u.activo ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      </div>
      {restableciendo && (
        <div className="flex gap-2 mt-3">
          <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)}
            placeholder="Contraseña nueva (8 o más caracteres)" aria-label="Contraseña nueva" className={`${claseInput} py-2`} />
          <button type="button" onClick={restablecer} className={`${claseBotonPrincipal} py-2`}>Restablecer</button>
        </div>
      )}
    </li>
  )
}

export default function UsuariosPanel({ urlBackend }) {
  const { usuario } = useAuth()
  const [usuarios, setUsuarios] = useState(null)
  const [nueva, setNueva] = useState(VACIA)
  const [mensaje, setMensaje] = useState(null)
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(() => {
    api.usuarios(urlBackend)
      .then((r) => setUsuarios(r.usuarios || []))
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudo cargar la lista de cuentas.' }))
  }, [urlBackend])

  useEffect(() => { cargar() }, [cargar])

  const crear = async (e) => {
    e.preventDefault()
    if (nueva.contrasena.length < 8) { setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' }); return }
    setCreando(true)
    try {
      await api.crearUsuario(urlBackend, { ...nueva, correo: nueva.correo.trim(), nombre: nueva.nombre.trim() })
      setMensaje({ tipo: 'ok', texto: `Cuenta creada para ${nueva.nombre.trim()}.` })
      setNueva(VACIA)
      cargar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.estado === 422 ? 'Revisa el correo: debe tener la forma nombre@dominio.' : err.message })
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-slate-900">Cuentas</p>
        {usuarios == null ? (
          <p className="text-[13px] text-slate-500 py-3">Cargando...</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <FilaUsuario key={u.id} u={u} esYo={u.id === usuario?.id} urlBackend={urlBackend} onCambio={cargar} setMensaje={setMensaje} />
            ))}
          </ul>
        )}
      </div>

      <Mensaje mensaje={mensaje} />

      <form onSubmit={crear} className="pt-5 border-t border-slate-100 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Crear una cuenta</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={claseEtiqueta} htmlFor="nu-nombre">Nombre</label>
            <input id="nu-nombre" required maxLength={60} value={nueva.nombre} onChange={(e) => setNueva((n) => ({ ...n, nombre: e.target.value }))}
              className={claseInput} placeholder="Familia Ovies" />
          </div>
          <div>
            <label className={claseEtiqueta} htmlFor="nu-correo">Correo</label>
            <input id="nu-correo" type="email" required autoCapitalize="none" value={nueva.correo}
              onChange={(e) => setNueva((n) => ({ ...n, correo: e.target.value }))} className={claseInput} placeholder="familia@energia.local" />
          </div>
          <div>
            <label className={claseEtiqueta} htmlFor="nu-rol">Rol</label>
            <select id="nu-rol" value={nueva.rol} onChange={(e) => setNueva((n) => ({ ...n, rol: e.target.value }))} className={claseInput}>
              <option value="residente">Residente: ve el consumo y los costos</option>
              <option value="tecnico">Técnico: además, nodos, registros y configuración</option>
            </select>
          </div>
          <div>
            <label className={claseEtiqueta} htmlFor="nu-clave">Contraseña inicial</label>
            <input id="nu-clave" type="password" required autoComplete="new-password" value={nueva.contrasena}
              onChange={(e) => setNueva((n) => ({ ...n, contrasena: e.target.value }))} className={claseInput} placeholder="8 o más caracteres" />
          </div>
        </div>
        <button type="submit" disabled={creando} className={claseBotonPrincipal}>{creando ? 'Creando...' : 'Crear cuenta'}</button>
      </form>
    </div>
  )
}
