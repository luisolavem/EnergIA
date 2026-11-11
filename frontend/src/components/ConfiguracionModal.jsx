// Configuración del sistema. Se monta solo cuando está abierta, así cada
// apertura parte de los valores guardados.
//   Pestaña "Conexión y costos": se guarda en el navegador.
//   Pestaña "Estilo": el tema se aplica y se guarda al instante.
//   Pestaña "Nodos": nombre/ubicación y parámetros de medición en el backend;
//   el nodo recibe los parámetros por MQTT en segundos.
//   Pestaña "Usuarios": cuentas y roles.  Pestaña "Mi cuenta": contraseña.
// Solo la abre el técnico.
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { URL_BACKEND_POR_DEFECTO, limpiarUrl } from '../config.js'
import { CambioContrasena, SelectorTema } from '../views/residente/Ajustes.jsx'
import UsuariosPanel from './UsuariosPanel.jsx'
import { Mensaje, claseEtiqueta, claseInput } from './ui.jsx'

const CAMPOS_NODO = [
  { clave: 'umbral_corriente_a', etiqueta: 'Corriente mínima con carga (A)', paso: 0.01, min: 0, max: 5,
    ayuda: 'Por debajo de este valor el nodo considera el aparato apagado y deja de enviar lecturas.' },
  { clave: 'muestras_para_reposo', etiqueta: 'Muestras para "sin carga"', paso: 1, min: 1, max: 30,
    ayuda: 'Lecturas seguidas bajo el umbral antes de suspender el envío (evita parpadeos).' },
  { clave: 'muestreo_ms', etiqueta: 'Muestreo del sensor (ms)', paso: 500, min: 1000, max: 60000,
    ayuda: 'Cada cuánto se lee el PZEM. Más de 5.000 ms afecta el cálculo de energía.' },
  { clave: 'publicar_activo_ms', etiqueta: 'Envío con carga (ms)', paso: 500, min: 1000, max: 300000,
    ayuda: 'Cada cuánto se publica una lectura mientras el aparato está encendido.' },
  { clave: 'umbral_voltaje_pct', etiqueta: 'Salto de voltaje que fuerza envío (%)', paso: 0.5, min: 0.5, max: 50,
    ayuda: 'Un cambio de tensión mayor a este porcentaje se publica de inmediato.' },
]


export default function ConfiguracionModal({
  pestanaInicial = 'conexion', nodoInicial = null, preferencias, onGuardarPreferencias,
  nodos = [], metadatos = {}, onMetadatoGuardado, onCerrar,
}) {
  const [pestana, setPestana] = useState(pestanaInicial)

  // --- Conexión y costos ---
  const [url, setUrl] = useState(preferencias.urlBackend)
  const [tarifa, setTarifa] = useState(String(preferencias.tarifaKwh))
  const [mensajeConexion, setMensajeConexion] = useState(null)

  // --- Nodos ---
  const [nodoId, setNodoId] = useState(nodoInicial || nodos[0]?.id || '')
  const [meta, setMeta] = useState({ nombre: '', ubicacion: '' })
  const [cfg, setCfg] = useState(null)
  const [mensajeNodo, setMensajeNodo] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const metadatosRef = useRef(metadatos)
  useEffect(() => { metadatosRef.current = metadatos }, [metadatos])

  useEffect(() => {
    const cerrarConEsc = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', cerrarConEsc)
    return () => window.removeEventListener('keydown', cerrarConEsc)
  }, [onCerrar])

  // Al elegir un nodo se cargan sus datos actuales del backend.
  useEffect(() => {
    if (!nodoId) return undefined
    const m = metadatosRef.current[nodoId] || {}
    setMeta({ nombre: m.nombre || '', ubicacion: m.ubicacion || '' })
    setCfg(null)
    setMensajeNodo(null)
    let vigente = true
    api.configNodo(preferencias.urlBackend, nodoId)
      .then((c) => { if (vigente) setCfg(c) })
      .catch(() => { if (vigente) setMensajeNodo({ tipo: 'error', texto: 'No se pudo leer la configuración del nodo desde el servidor.' }) })
    return () => { vigente = false }
  }, [nodoId, preferencias.urlBackend])

  const probarConexion = async () => {
    setMensajeConexion({ tipo: 'info', texto: 'Probando conexión...' })
    try {
      const r = await api.salud(limpiarUrl(url))
      setMensajeConexion({
        tipo: r.mqtt_conectado ? 'ok' : 'error',
        texto: r.mqtt_conectado
          ? 'Servidor encontrado y broker MQTT activo.'
          : 'El servidor responde, pero no está conectado al broker MQTT.',
      })
    } catch {
      setMensajeConexion({ tipo: 'error', texto: 'No hay respuesta en esa dirección. Revisa la IP y que el backend esté encendido.' })
    }
  }

  const guardarConexion = () => {
    const valorTarifa = Number(tarifa)
    if (!(valorTarifa > 0)) {
      setMensajeConexion({ tipo: 'error', texto: 'La tarifa debe ser un número mayor que cero.' })
      return
    }
    onGuardarPreferencias({ urlBackend: limpiarUrl(url) || URL_BACKEND_POR_DEFECTO, tarifaKwh: valorTarifa })
    onCerrar()
  }

  const guardarNodo = async () => {
    if (!nodoId) return
    if (cfg && CAMPOS_NODO.some((c) => !Number.isFinite(Number(cfg[c.clave])))) {
      setMensajeNodo({ tipo: 'error', texto: 'Revisa los parámetros: todos deben ser números.' })
      return
    }
    setGuardando(true)
    setMensajeNodo(null)
    try {
      const datosMeta = { nombre: meta.nombre.trim(), ubicacion: meta.ubicacion.trim() }
      await api.guardarMetadatos(preferencias.urlBackend, nodoId, datosMeta)
      onMetadatoGuardado(nodoId, datosMeta)
      if (cfg) {
        const numeros = Object.fromEntries(CAMPOS_NODO.map((c) => [c.clave, Number(cfg[c.clave])]))
        const r = await api.guardarConfigNodo(preferencias.urlBackend, nodoId, { ...cfg, ...numeros })
        setMensajeNodo({
          tipo: 'ok',
          texto: r.nodo_notificado
            ? 'Guardado. El nodo aplicará los parámetros en unos segundos.'
            : 'Guardado. El nodo tomará los parámetros cuando se vuelva a conectar.',
        })
      } else {
        setMensajeNodo({ tipo: 'ok', texto: 'Nombre y ubicación guardados.' })
      }
    } catch {
      setMensajeNodo({ tipo: 'error', texto: 'No se pudo guardar (valores fuera de rango o servidor sin conexión).' })
    } finally {
      setGuardando(false)
    }
  }

  const pestanas = [
    { id: 'conexion', texto: 'Conexión y costos' },
    { id: 'nodos', texto: 'Nodos' },
    { id: 'usuarios', texto: 'Usuarios' },
    { id: 'estilo', texto: 'Estilo' },
    { id: 'cuenta', texto: 'Mi cuenta' },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200/70 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-configuracion"
      >
        {/* Cabecera */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <h2 id="titulo-configuracion" className="font-semibold text-slate-900 text-lg">Configuración</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeWidth="2" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {/* Pestañas */}
        <div className="flex border-b border-slate-200/70 px-6 gap-5 text-sm overflow-x-auto" role="tablist">
          {pestanas.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={`pb-2.5 border-b-2 whitespace-nowrap transition-colors ${pestana === p.id ? 'border-primario-600 text-slate-900 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {p.texto}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700">
          {pestana === 'usuarios' && <UsuariosPanel urlBackend={preferencias.urlBackend} />}
          {pestana === 'cuenta' && <CambioContrasena urlBackend={preferencias.urlBackend} />}
          {pestana === 'conexion' && (
            <div className="space-y-5">
              <div>
                <label className={claseEtiqueta} htmlFor="cfg-url">Servidor backend</label>
                <div className="flex gap-2">
                  <input
                    id="cfg-url"
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className={`${claseInput} num`}
                    placeholder="http://192.168.1.28:8000"
                  />
                  <button
                    onClick={probarConexion}
                    className="px-4 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap"
                  >
                    Probar
                  </button>
                </div>
                <p className="text-[13px] text-slate-500 mt-1.5">
                  IP y puerto de la Raspberry donde corre FastAPI. El cambio se aplica al guardar.{' '}
                  <button className="text-primario-700 font-medium hover:underline" onClick={() => setUrl(URL_BACKEND_POR_DEFECTO)}>
                    Usar valor por defecto
                  </button>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className={claseEtiqueta} htmlFor="cfg-tarifa">Tarifa kWh (COP)</label>
                <input
                  id="cfg-tarifa"
                  type="number"
                  min="0"
                  step="1"
                  value={tarifa}
                  onChange={(e) => setTarifa(e.target.value)}
                  className={claseInput}
                  placeholder="850"
                />
                <p className="text-[13px] text-slate-500 mt-1.5">Valor del kWh en la factura (según el estrato). Se usa para estimar los costos.</p>
              </div>

              <Mensaje mensaje={mensajeConexion} />
            </div>
          )}

          {pestana === 'estilo' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Se aplica al instante y queda guardado en este navegador.</p>
              <SelectorTema temaActual={preferencias.tema} onElegir={(tema) => onGuardarPreferencias({ tema })} />
              <p className="text-[13px] text-slate-500">
                Los colores de estado y el color de cada nodo se mantienen en todos los temas, para que su significado no cambie.
              </p>
            </div>
          )}

          {pestana === 'nodos' && (
            nodos.length === 0 ? (
              <p className="text-[13px] text-slate-500 text-center py-6">Aún no hay nodos registrados en el servidor.</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <label className={claseEtiqueta} htmlFor="cfg-nodo">Nodo</label>
                  <select id="cfg-nodo" value={nodoId} onChange={(e) => setNodoId(e.target.value)} className={claseInput}>
                    {nodos.map((n) => <option key={n.id} value={n.id}>{n.nombre} ({n.id})</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={claseEtiqueta} htmlFor="cfg-nombre">Electrodoméstico</label>
                    <input
                      id="cfg-nombre"
                      type="text"
                      maxLength={40}
                      value={meta.nombre}
                      onChange={(e) => setMeta((m) => ({ ...m, nombre: e.target.value }))}
                      className={claseInput}
                      placeholder="Ej.: Nevera"
                    />
                  </div>
                  <div>
                    <label className={claseEtiqueta} htmlFor="cfg-ubicacion">Ubicación</label>
                    <input
                      id="cfg-ubicacion"
                      type="text"
                      maxLength={40}
                      value={meta.ubicacion}
                      onChange={(e) => setMeta((m) => ({ ...m, ubicacion: e.target.value }))}
                      className={claseInput}
                      placeholder="Ej.: Cocina"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-4">
                  <p className="text-sm font-semibold text-slate-900">Parámetros de medición (se envían al ESP32)</p>
                  {!cfg ? (
                    <p className="text-[13px] text-slate-500">Cargando parámetros...</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {CAMPOS_NODO.map((c) => (
                        <div key={c.clave}>
                          <label className={claseEtiqueta} htmlFor={`cfg-${c.clave}`}>{c.etiqueta}</label>
                          <input
                            id={`cfg-${c.clave}`}
                            type="number"
                            step={c.paso}
                            min={c.min}
                            max={c.max}
                            value={cfg[c.clave] ?? ''}
                            onChange={(e) => setCfg((prev) => ({ ...prev, [c.clave]: e.target.value }))}
                            className={claseInput}
                          />
                          <p className="text-[13px] text-slate-500 mt-1.5">{c.ayuda}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Mensaje mensaje={mensajeNodo} />
              </div>
            )
          )}
        </div>

        {/* Pie */}
        <div className="px-6 py-4 border-t border-slate-200/70 flex items-center justify-end gap-3">
          <button
            onClick={onCerrar}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {pestana === 'conexion' ? 'Cancelar' : 'Cerrar'}
          </button>
          {pestana === 'conexion' && (
            <button
              onClick={guardarConexion}
              className="px-5 py-2 rounded-xl text-sm font-semibold btn-principal bg-primario-600 text-white hover:bg-primario-700 transition-colors"
            >
              Guardar cambios
            </button>
          )}
          {pestana === 'nodos' && (
            <button
              onClick={guardarNodo}
              disabled={guardando || !nodoId}
              className="px-5 py-2 rounded-xl text-sm font-semibold btn-principal bg-primario-600 text-white hover:bg-primario-700 transition-colors disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar nodo'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
