// Navegación: barra superior (cuenta y estado), barra lateral en escritorio
// y barra inferior en celular. El menú depende del rol (config.js -> SECCIONES).
import { LogoEnergia, Marca } from './ui.jsx'

const ICONOS = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z',
  aparatos: 'M9 3v4m6-4v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5',
  ajustes: 'M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0M16 4v4M10 10v4M18 16v4',
  panel: 'M4 5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5ZM4 14a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5Z',
  nodos: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  alertas: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  registros: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  configuracion: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  salir: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
}

function Icono({ nombre, className = 'w-[18px] h-[18px]' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d={ICONOS[nombre]} />
    </svg>
  )
}

function Item({ id, texto, activo, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-current={activo ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${activo
        ? 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-slate-900 font-semibold'
        : 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <span className={activo ? 'text-primario-600' : 'text-slate-500'}><Icono nombre={id} /></span>
      {texto}
    </button>
  )
}

export function BarraLateral({ secciones, vista, onCambiarVista, usuario, onAbrirConfiguracion }) {
  const esTecnico = usuario?.rol === 'tecnico'
  const grupos = []
  for (const s of secciones) {
    const g = grupos.find((x) => x.nombre === s.grupo)
    g ? g.items.push(s) : grupos.push({ nombre: s.grupo, items: [s] })
  }
  return (
    <aside className="w-64 h-full flex-shrink-0 bg-slate-50 border-r border-slate-200/80 flex-col hidden md:flex">
      <div className="h-[68px] px-5 flex items-center border-b border-slate-200/80"><Marca /></div>
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6" aria-label="Secciones">
        {grupos.map((g) => (
          <div key={g.nombre}>
            <p className="px-3 mb-2 text-[11px] font-medium tracking-[0.08em] uppercase text-slate-500">{g.nombre}</p>
            <div className="space-y-1">
              {g.items.map((s) => (
                <Item key={s.id} id={s.id} texto={s.etiqueta} activo={vista === s.id} onClick={() => onCambiarVista(s.id)} />
              ))}
              {esTecnico && g.nombre === 'Administración' && (
                <Item id="configuracion" texto="Configuración" activo={false} onClick={onAbrirConfiguracion} />
              )}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}

// Barra superior: título de la sección, estado y cuenta (como en GymOS).
// Barra superior: dónde estás, el estado y el menú del perfil (como en GymOS).
export function BarraSuperior({ grupo, titulo, estado, perfil }) {
  return (
    <header className="h-[60px] md:h-[68px] flex-shrink-0 bg-white border-b border-slate-200/80 px-4 md:px-8 flex items-center justify-between gap-3 relative z-20">
      <div className="flex items-center gap-3 min-w-0">
        <LogoEnergia className="md:hidden w-8 h-8 flex-shrink-0" />
        <p className="text-sm truncate">
          {grupo && <span className="text-slate-500 hidden sm:inline">{grupo} <span aria-hidden="true">/</span> </span>}
          <span className="font-medium text-slate-900">{titulo}</span>
        </p>
      </div>
      <div className="flex items-center gap-3 md:gap-5">
        {estado && <span className="hidden sm:inline-flex">{estado}</span>}
        {perfil}
      </div>
    </header>
  )
}

export function BarraMovil({ secciones, vista, onCambiarVista, usuario, onAbrirConfiguracion }) {
  const esTecnico = usuario?.rol === 'tecnico'
  // En celular el técnico ve 4 secciones + Configuración; la vista del residente queda en el menú de escritorio.
  const visibles = esTecnico ? secciones.filter((s) => s.id !== 'inicio') : secciones
  const claseBoton = (activo) =>
    `flex-1 flex flex-col items-center gap-1 py-1.5 text-xs ${activo ? 'text-primario-700 font-semibold' : 'text-slate-500'}`
  return (
    <nav
      aria-label="Secciones"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex px-1 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      {visibles.map((s) => (
        <button key={s.id} onClick={() => onCambiarVista(s.id)} aria-current={vista === s.id ? 'page' : undefined} className={claseBoton(vista === s.id)}>
          <Icono nombre={s.id} className="w-5 h-5" />
          {s.corto || s.etiqueta}
        </button>
      ))}
      {esTecnico && (
        <button onClick={onAbrirConfiguracion} className={claseBoton(false)}>
          <Icono nombre="configuracion" className="w-5 h-5" />
          Ajustes
        </button>
      )}
    </nav>
  )
}
