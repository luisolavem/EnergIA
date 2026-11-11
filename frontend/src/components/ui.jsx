// Piezas visuales compartidas (estilo sobrio: fondos neutros, bordes suaves,
// un solo color de acento y etiquetas con una barra de color a la izquierda).

export function Marca({ tamano = 'normal' }) {
  const grande = tamano === 'grande'
  return (
    <div className="flex items-center gap-3">
      <div className={`${grande ? 'w-10 h-10' : 'w-9 h-9'} rounded-xl bg-primario-500 text-white flex items-center justify-center flex-shrink-0`}>
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
      </div>
      <div className="leading-tight">
        <p className={`font-semibold text-slate-900 ${grande ? 'text-lg' : 'text-[15px]'}`}>EnergIA</p>
        <p className="text-xs text-slate-500">Monitoreo del hogar</p>
      </div>
    </div>
  )
}

export const claseTarjeta = 'bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'

export function Tarjeta({ titulo, descripcion, acciones, children, className = '', relleno = 'p-5 md:p-6' }) {
  return (
    <section className={`${claseTarjeta} ${relleno} ${className}`}>
      {(titulo || acciones) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {titulo && <h2 className="text-[15px] font-semibold text-slate-900">{titulo}</h2>}
            {descripcion && <p className="text-[13px] text-slate-500 mt-0.5">{descripcion}</p>}
          </div>
          {acciones && <div className="flex-shrink-0 flex gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

const ICONOS = {
  rayo: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  calendario: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  onda: 'M2 12h3l3-7 4 14 3-7h7',
  nodos: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  moneda: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  reloj: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  enchufe: 'M9 3v4m6-4v4M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5',
  alerta: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  ia: 'M9.5 3 11 7.5 15.5 9 11 10.5 9.5 15 8 10.5 3.5 9 8 7.5 9.5 3Zm8 9 .9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z',
  diana: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  cerrar: 'M6 6l12 12M18 6 6 18',
}

export function Icono({ nombre, className = 'w-[18px] h-[18px]' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d={ICONOS[nombre]} />
    </svg>
  )
}

// Indicador: título, cifra grande y nota; ícono gris discreto arriba a la derecha.
export function Indicador({ titulo, valor, unidad, nota, icono, destacado = false }) {
  return (
    <div className={`${claseTarjeta} p-5 min-w-0`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600">{titulo}</p>
        {icono && <span className="text-slate-400 flex-shrink-0"><Icono nombre={icono} /></span>}
      </div>
      <p className={`mt-2 font-semibold text-slate-900 tracking-tight ${destacado ? 'text-4xl' : 'text-[28px] leading-9'}`}>
        {valor}{unidad && <span className="text-base font-medium text-slate-500 ml-1">{unidad}</span>}
      </p>
      {nota && <p className="text-[13px] text-slate-500 mt-1.5 truncate">{nota}</p>}
    </div>
  )
}

const BARRAS = { ok: 'border-emerald-500', aviso: 'border-amber-500', falla: 'border-red-500', neutro: 'border-slate-300', acento: 'border-primario-500' }

// Etiqueta: fondo gris claro y una barra de color a la izquierda.
// El color solo marca el tipo; el texto siempre dice el estado.
export function Etiqueta({ tono = 'neutro', children, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md border-l-[3px] bg-slate-100 text-[13px] font-medium text-slate-800 whitespace-nowrap ${BARRAS[tono] || BARRAS.neutro} ${className}`}>
      {children}
    </span>
  )
}

// Se conserva el nombre anterior para no cambiar los componentes que lo usan.
export const Pastilla = Etiqueta

const PUNTOS = { ok: 'bg-emerald-500', aviso: 'bg-amber-500', falla: 'bg-red-500', neutro: 'bg-slate-400' }

// Estado sin caja, para listas
export function EstadoTexto({ tono = 'neutro', children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PUNTOS[tono] || PUNTOS.neutro}`}></span>
      {children}
    </span>
  )
}

// Punto de color que identifica un aparato (el mismo de las gráficas)
export function PuntoAparato({ color, className = '' }) {
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${className}`} style={{ backgroundColor: color }} aria-hidden="true"></span>
}

export function Selector({ value, onChange, etiqueta, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={etiqueta}
      className="pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 focus:outline-none focus:border-primario-500"
    >
      {children}
    </select>
  )
}

export function Vacio({ children }) {
  return <p className="text-[13px] text-slate-500 py-6 text-center">{children}</p>
}

export const claseInput = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-primario-500 focus:ring-2 focus:ring-primario-500/15'
export const claseEtiqueta = 'block text-[13px] font-medium text-slate-700 mb-1.5'
export const claseBotonPrincipal = 'btn-principal inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-primario-600 text-white hover:bg-primario-700 disabled:opacity-50 transition-colors'
export const claseBotonSecundario = 'inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors'

export function Mensaje({ mensaje }) {
  if (!mensaje) return null
  const tono = { ok: 'ok', error: 'falla', info: 'neutro' }[mensaje.tipo]
  return (
    <p role="status" className={`text-[13px] px-3 py-2 rounded-md border-l-[3px] bg-slate-100 text-slate-800 ${BARRAS[tono]}`}>
      {mensaje.texto}
    </p>
  )
}
