// Menú del perfil (botón con el avatar, arriba a la derecha).
// Residente: apariencia, tarifa, nombres de aparatos, avisos, contraseña, salir.
// Técnico: ver la app como técnico o residente, tema, potencia en kW,
// usuarios, servidor, contraseña y salir.
import { useEffect, useRef, useState } from 'react'
import { TEMAS } from '../config.js'

const ICONOS = {
  moneda: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  aparatos: 'M9 3v4m6-4v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5',
  campana: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  candado: 'M6 11h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Zm2 0V7a4 4 0 0 1 8 0v4',
  usuarios: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a5 5 0 0 0-4-4.9',
  servidor: 'M5 4h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 9h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Zm2-5.5h.01M7 16.5h.01',
  salir: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  flecha: 'm6 9 6 6 6-6',
}

function Icono({ nombre, className = 'w-[18px] h-[18px]' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d={ICONOS[nombre]} />
    </svg>
  )
}

function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?'
}

function hostDe(url) {
  try { return new URL(url).host } catch { return url }
}

function Avatar({ nombre, grande = false }) {
  return (
    <span className={`${grande ? 'w-11 h-11 text-[15px]' : 'w-8 h-8 text-[13px]'} rounded-full bg-primario-600 text-white font-semibold flex items-center justify-center flex-shrink-0 btn-principal`}>
      {iniciales(nombre)}
    </span>
  )
}

function Segmentado({ etiqueta, opciones, valor, onCambiar }) {
  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-2">{etiqueta}</p>
      <div className="grid gap-1 bg-slate-100 rounded-lg p-1" style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            onClick={() => onCambiar(o.id)}
            className={`py-1.5 rounded-md text-[13px] transition-colors ${valor === o.id ? 'bg-white text-slate-900 font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  )
}

function Opcion({ icono, texto, detalle, extra, onClick, peligro = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-slate-100 ${peligro ? 'text-red-700' : 'text-slate-900'}`}
    >
      <span className={peligro ? 'text-red-700' : 'text-slate-500'}><Icono nombre={icono} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm">{texto}</span>
        {detalle && <span className="block text-xs text-slate-500 truncate">{detalle}</span>}
      </span>
      {extra && <span className="text-xs text-slate-500">{extra}</span>}
    </button>
  )
}

function Interruptor({ id, icono, texto, activo, onCambiar }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {icono && <span className="text-slate-500"><Icono nombre={icono} /></span>}
      <label htmlFor={id} className="flex-1 text-sm text-slate-900 cursor-pointer">{texto}</label>
      <input id={id} type="checkbox" checked={activo} onChange={(e) => onCambiar(e.target.checked)} className="w-[18px] h-[18px] accent-primario-600 cursor-pointer" />
    </div>
  )
}

const TEMA_CLARO = 'cian'

export default function MenuPerfil({
  usuario, preferencias, onGuardarPreferencias, vista, onIr, onAbrirConfiguracion, onSalir, urlBackend, conectado,
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  const esTecnico = usuario?.rol === 'tecnico'

  // Se cierra al tocar fuera o con Escape
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const y = (accion) => () => { setAbierto(false); accion() }
  const apariencia = preferencias.tema === 'auto' ? 'auto' : preferencias.tema === 'oscuro' ? 'oscuro' : 'claro'

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Abrir el menú del perfil"
        className="flex items-center gap-2.5 rounded-full border border-primario-200 bg-primario-50 pl-1 pr-3 py-1 hover:border-primario-300"
      >
        <Avatar nombre={usuario?.nombre} />
        <span className="hidden sm:block text-sm font-medium text-slate-900 max-w-[10rem] truncate">{usuario?.nombre}</span>
        <Icono nombre="flecha" className={`w-3.5 h-3.5 text-slate-600 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-[min(92vw,380px)] bg-white border border-slate-200 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.12)] overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
            <Avatar nombre={usuario?.nombre} grande />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-slate-900 truncate">{usuario?.nombre}</p>
              <p className="text-[13px] text-slate-500 truncate">{usuario?.correo}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 border-l-[3px] ${esTecnico ? 'border-primario-500' : 'border-emerald-500'} text-slate-800`}>
              {esTecnico ? 'Técnico' : 'Residente'}
            </span>
          </div>

          {esTecnico ? (
            <div className="px-4 py-3.5 border-b border-slate-100 space-y-3.5">
              <Segmentado
                etiqueta="Ver la app como"
                opciones={[{ id: 'tecnico', texto: 'Técnico' }, { id: 'residente', texto: 'Residente' }]}
                valor={vista === 'inicio' ? 'residente' : 'tecnico'}
                onCambiar={(v) => { onIr(v === 'residente' ? 'inicio' : 'panel'); setAbierto(false) }}
              />
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-slate-500">Tema</p>
                <div className="flex gap-2" role="radiogroup" aria-label="Tema de color">
                  {TEMAS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={preferencias.tema === t.id}
                      aria-label={`Tema ${t.nombre}`}
                      title={t.nombre}
                      onClick={() => onGuardarPreferencias({ tema: t.id })}
                      className={`w-[26px] h-[26px] rounded-full border-2 border-white ${preferencias.tema === t.id ? 'ring-2 ring-primario-600' : 'ring-1 ring-slate-200'}`}
                      style={{ backgroundColor: t.id === 'oscuro' ? t.muestra[2] : t.muestra[0] }}
                    />
                  ))}
                </div>
              </div>
              <div className="-mx-3">
                <Interruptor id="pref-kw" texto="Potencia en kW en lugar de W" activo={preferencias.potenciaKw} onCambiar={(v) => onGuardarPreferencias({ potenciaKw: v })} />
              </div>
            </div>
          ) : (
            <div className="px-4 py-3.5 border-b border-slate-100">
              <Segmentado
                etiqueta="Apariencia"
                opciones={[{ id: 'claro', texto: 'Claro' }, { id: 'oscuro', texto: 'Oscuro' }, { id: 'auto', texto: 'Automático' }]}
                valor={apariencia}
                onCambiar={(v) => onGuardarPreferencias({ tema: v === 'claro' ? TEMA_CLARO : v })}
              />
            </div>
          )}

          <div className="p-1.5">
            {esTecnico ? (
              <>
                <Opcion icono="usuarios" texto="Usuarios y roles" onClick={y(() => onAbrirConfiguracion('usuarios'))} />
                <Opcion icono="servidor" texto="Servidor y nodos" detalle={`${hostDe(urlBackend)}, ${conectado ? 'conectado' : 'sin conexión'}`} onClick={y(() => onAbrirConfiguracion('conexion'))} />
                <Opcion icono="candado" texto="Cambiar contraseña" onClick={y(() => onAbrirConfiguracion('cuenta'))} />
              </>
            ) : (
              <>
                <Opcion icono="moneda" texto="Mi tarifa" detalle={`$ ${preferencias.tarifaKwh.toLocaleString('es-CO')} por kWh`} onClick={y(() => onIr('ajustes'))} />
                <Opcion icono="aparatos" texto="Nombres de mis aparatos" onClick={y(() => onIr('ajustes'))} />
                <Interruptor id="pref-avisos" icono="campana" texto="Avisos cuando algo falla" activo={preferencias.avisos} onCambiar={(v) => onGuardarPreferencias({ avisos: v })} />
                <Opcion icono="candado" texto="Cambiar contraseña" onClick={y(() => onIr('ajustes'))} />
              </>
            )}
          </div>

          <div className="p-1.5 border-t border-slate-100">
            <Opcion icono="salir" texto="Cerrar sesión" peligro onClick={y(onSalir)} />
          </div>
        </div>
      )}
    </div>
  )
}
