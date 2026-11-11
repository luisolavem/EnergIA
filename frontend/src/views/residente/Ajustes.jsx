// Ajustes del residente: tarifa, nombres de los aparatos, tema, contraseña y salir.
// No incluye la dirección del servidor ni los parámetros de los nodos: si se
// cambian por error, el sistema deja de medir.
import { useEffect, useRef, useState } from 'react'
import {
  Mensaje, Tarjeta, claseBotonPrincipal, claseBotonSecundario, claseEtiqueta, claseInput,
} from '../../components/ui.jsx'
import { TEMAS } from '../../config.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../lib/api.js'

function Tarifa({ preferencias, onGuardar }) {
  const [valor, setValor] = useState(String(preferencias.tarifaKwh))
  const [mensaje, setMensaje] = useState(null)
  const guardar = (e) => {
    e.preventDefault()
    const n = Number(valor)
    if (!(n > 0)) { setMensaje({ tipo: 'error', texto: 'Escribe un valor mayor que cero.' }); return }
    onGuardar({ tarifaKwh: n })
    setMensaje({ tipo: 'ok', texto: 'Tarifa guardada.' })
  }
  return (
    <Tarjeta titulo="Mi factura" descripcion="El valor del kWh que aparece en tu recibo de energía.">
      <form onSubmit={guardar} className="space-y-3">
        <div>
          <label className={claseEtiqueta} htmlFor="aj-tarifa">Valor del kWh (pesos)</label>
          <div className="flex gap-2">
            <input id="aj-tarifa" type="number" min="1" step="1" inputMode="numeric" value={valor}
              onChange={(e) => setValor(e.target.value)} className={`${claseInput} max-w-[12rem] num`} />
            <button type="submit" className={claseBotonPrincipal}>Guardar</button>
          </div>
          <p className="text-[13px] text-slate-500 mt-1.5">Por ahora se guarda en este navegador.</p>
        </div>
        <Mensaje mensaje={mensaje} />
      </form>
    </Tarjeta>
  )
}

function Nombres({ nodos, urlBackend, onMetadatoGuardado }) {
  const [valores, setValores] = useState({})
  const originales = useRef({})
  const [mensaje, setMensaje] = useState(null)

  // Los nombres llegan del servidor unos segundos después de abrir la app:
  // se actualizan los campos que la persona no ha tocado.
  useEffect(() => {
    setValores((prev) => {
      const siguiente = { ...prev }
      for (const n of nodos) {
        const original = originales.current[n.id]
        const actual = prev[n.id]
        const sinTocar = !actual || (original && actual.nombre === original.nombre && actual.ubicacion === original.ubicacion)
        if (sinTocar) siguiente[n.id] = { nombre: n.nombreBase, ubicacion: n.ubicacion }
        originales.current[n.id] = { nombre: n.nombreBase, ubicacion: n.ubicacion }
      }
      return siguiente
    })
  }, [nodos])
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    setMensaje(null)
    try {
      for (const n of nodos) {
        const v = valores[n.id]
        if (!v || (v.nombre === n.nombreBase && v.ubicacion === n.ubicacion)) continue
        const datos = { nombre: v.nombre.trim(), ubicacion: v.ubicacion.trim() }
        await api.guardarMetadatos(urlBackend, n.id, datos)
        onMetadatoGuardado(n.id, datos)
      }
      setMensaje({ tipo: 'ok', texto: 'Nombres guardados.' })
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudieron guardar. Revisa la conexión e inténtalo de nuevo.' })
    } finally {
      setGuardando(false)
    }
  }

  if (!nodos.length) return null
  return (
    <Tarjeta titulo="Mis aparatos" descripcion="Cómo se llama cada aparato en la app y dónde está.">
      <form onSubmit={guardar} className="space-y-3">
        {nodos.map((n) => (
          <div key={n.id} className="grid grid-cols-[6px_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center">
            <span className="h-9 rounded-full" style={{ backgroundColor: n.color }} aria-hidden="true"></span>
            <input aria-label={`Nombre de ${n.nombre}`} maxLength={40} value={valores[n.id]?.nombre ?? ''}
              onChange={(e) => setValores((p) => ({ ...p, [n.id]: { ...p[n.id], nombre: e.target.value } }))}
              className={claseInput} placeholder="Nombre" />
            <input aria-label={`Ubicación de ${n.nombre}`} maxLength={40} value={valores[n.id]?.ubicacion ?? ''}
              onChange={(e) => setValores((p) => ({ ...p, [n.id]: { ...p[n.id], ubicacion: e.target.value } }))}
              className={claseInput} placeholder="Ubicación" />
          </div>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={guardando} className={claseBotonPrincipal}>{guardando ? 'Guardando...' : 'Guardar nombres'}</button>
        </div>
        <Mensaje mensaje={mensaje} />
      </form>
    </Tarjeta>
  )
}

export function SelectorTema({ temaActual, onElegir }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {TEMAS.map((t) => {
        const activo = temaActual === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onElegir(t.id)}
            aria-pressed={activo}
            className={`p-4 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${activo ? 'border-primario-500 ring-2 ring-primario-500/15' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{t.nombre}</p>
              <p className="text-[13px] text-slate-500">{activo ? 'En uso' : t.descripcion}</p>
            </div>
            <div className="flex -space-x-1.5 flex-shrink-0" aria-hidden="true">
              {t.muestra.map((color) => (
                <span key={color} className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-slate-200" style={{ backgroundColor: color }} />
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function CambioContrasena({ urlBackend }) {
  const { reemplazarToken } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    if (nueva.length < 8) { setMensaje({ tipo: 'error', texto: 'La contraseña nueva debe tener al menos 8 caracteres.' }); return }
    if (nueva !== repetida) { setMensaje({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden.' }); return }
    setEnviando(true)
    try {
      const r = await api.cambiarContrasena(urlBackend, actual, nueva)
      reemplazarToken(r.token)
      setActual(''); setNueva(''); setRepetida('')
      setMensaje({ tipo: 'ok', texto: 'Contraseña cambiada. Las sesiones abiertas en otros equipos se cerraron.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.estado === 400 ? err.message : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3 max-w-md">
      <div>
        <label className={claseEtiqueta} htmlFor="pw-actual">Contraseña actual</label>
        <input id="pw-actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} className={claseInput} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={claseEtiqueta} htmlFor="pw-nueva">Nueva</label>
          <input id="pw-nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={claseInput} />
        </div>
        <div>
          <label className={claseEtiqueta} htmlFor="pw-repetida">Repítela</label>
          <input id="pw-repetida" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} className={claseInput} />
        </div>
      </div>
      <button type="submit" disabled={enviando || !actual} className={claseBotonPrincipal}>{enviando ? 'Cambiando...' : 'Cambiar contraseña'}</button>
      <Mensaje mensaje={mensaje} />
    </form>
  )
}

export default function Ajustes({ preferencias, onGuardarPreferencias, nodos, urlBackend, onMetadatoGuardado }) {
  const { usuario, cerrarSesion } = useAuth()
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 items-start">
      <Tarifa preferencias={preferencias} onGuardar={onGuardarPreferencias} />
      <Nombres nodos={nodos} urlBackend={urlBackend} onMetadatoGuardado={onMetadatoGuardado} />
      <Tarjeta titulo="Apariencia" descripcion="Se aplica al instante en este navegador.">
        <SelectorTema temaActual={preferencias.tema} onElegir={(tema) => onGuardarPreferencias({ tema })} />
      </Tarjeta>
      <Tarjeta titulo="Cuenta" descripcion={`Entraste como ${usuario?.correo}.`}>
        <CambioContrasena urlBackend={urlBackend} />
        <div className="mt-5 pt-5 border-t border-slate-100">
          <button type="button" onClick={() => cerrarSesion()} className={claseBotonSecundario}>Cerrar sesión</button>
        </div>
      </Tarjeta>
    </div>
  )
}
