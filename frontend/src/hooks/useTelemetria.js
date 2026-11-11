// Conexión en tiempo real con el backend.
// Mantiene: lecturas, estado de conexión y de carga de cada nodo, metadatos,
// series de los últimos minutos (para las gráficas), lecturas recibidas (logs)
// y la bitácora de eventos del sistema.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import {
  MAX_EVENTOS_BITACORA, MAX_LECTURAS_LOG, RANGO_SENSOR, VENTANA_TIEMPO_REAL_MIN, urlWebSocket,
} from '../config.js'

// Lecturas imposibles para el sensor (errores del PZEM) no se muestran.
const enRango = (l) => ['voltaje', 'corriente', 'potencia'].every((k) => {
  const v = l[k]
  return v == null || (Number.isFinite(v) && v >= RANGO_SENSOR[k][0] && v <= RANGO_SENSOR[k][1])
})

const VENTANA_MS = VENTANA_TIEMPO_REAL_MIN * 60 * 1000
const INTERVALO_SALUD_MS = 30_000
let contadorIds = 0

const listaAObjeto = (lista = []) =>
  Object.fromEntries((lista || []).filter((x) => x?.nodo).map((x) => [x.nodo, x]))

const aPunto = (l) => ({
  t: Date.parse(l.timestamp), voltaje: l.voltaje, corriente: l.corriente, potencia: l.potencia,
})

// Une puntos sin duplicar por marca de tiempo y descarta los que salen de la ventana.
function fusionar(existentes = [], nuevos = []) {
  const mapa = new Map()
  for (const p of existentes) mapa.set(p.t, p)
  for (const p of nuevos) if (Number.isFinite(p.t)) mapa.set(p.t, p)
  const limite = Date.now() - VENTANA_MS
  return [...mapa.values()].filter((p) => p.t >= limite && enRango(p)).sort((a, b) => a.t - b.t)
}

function entrada(tipo, t, nodo, detalle) {
  return { id: ++contadorIds, clave: `${tipo}-${t}-${nodo ?? ''}-${detalle?.tipo ?? ''}`, tipo, t, nodo, detalle }
}

// token: sesión actual (sin token no se conecta).
// esTecnico: solo el técnico carga los eventos del sistema (el backend los niega al residente).
// onSesionInvalida: el WebSocket se cerró con 4401 (token vencido o cuenta desactivada).
// onAlertaIA: el modelo de anomalías detectó una hora fuera de lo normal.
export default function useTelemetria(urlBackend, { token, esTecnico = false, onSesionInvalida, onAlertaIA } = {}) {
  const [conectado, setConectado] = useState(false)
  const [mqttConectado, setMqttConectado] = useState(null)
  const [lecturas, setLecturas] = useState({})
  const [estados, setEstados] = useState({})
  const [cargas, setCargas] = useState({})
  const [metadatos, setMetadatos] = useState({})
  const [series, setSeries] = useState({})
  const [paquetes, setPaquetes] = useState([])
  const [bitacora, setBitacora] = useState([])

  const agregarBitacora = useCallback((nuevas) => {
    setBitacora((prev) => {
      const claves = new Set(prev.map((e) => e.clave))
      const unicas = nuevas.filter((e) => !claves.has(e.clave))
      return [...unicas, ...prev].sort((a, b) => b.t - a.t).slice(0, MAX_EVENTOS_BITACORA)
    })
  }, [])

  const cargarHistorial = useCallback(async (ids) => {
    const resultados = await Promise.allSettled(
      ids.map((id) => api.historico(urlBackend, id, `-${VENTANA_TIEMPO_REAL_MIN}m`, '10s')),
    )
    setSeries((prev) => {
      const siguiente = { ...prev }
      resultados.forEach((r, i) => {
        if (r.status !== 'fulfilled') return
        const puntos = (r.value.puntos || [])
          .filter((p) => p.potencia != null)
          .map((p) => ({ t: Date.parse(p.timestamp), voltaje: p.voltaje, corriente: p.corriente, potencia: p.potencia }))
        siguiente[ids[i]] = fusionar(siguiente[ids[i]], puntos)
      })
      return siguiente
    })
  }, [urlBackend])

  const cargarDatosIniciales = useCallback(async (ids) => {
    cargarHistorial(ids)
    api.metadatos(urlBackend).then((r) => setMetadatos(r.nodos || {})).catch(() => {})
    if (!esTecnico) return
    api.eventos(urlBackend, 50)
      .then((r) => agregarBitacora((r.eventos || []).map((ev) =>
        entrada('evento', Date.parse(ev.registrado) || Date.now(), null, ev))))
      .catch(() => {})
  }, [urlBackend, esTecnico, cargarHistorial, agregarBitacora])

  const procesar = useCallback((msg) => {
    const d = msg.data
    switch (msg.type) {
      case 'snapshot': {
        setLecturas(listaAObjeto((d || []).filter(enRango)))
        cargarDatosIniciales((d || []).map((l) => l.nodo))
        break
      }
      case 'update': {
        if (!enRango(d)) break
        setLecturas((prev) => ({ ...prev, [d.nodo]: d }))
        setPaquetes((prev) => [{ id: ++contadorIds, ...d }, ...prev].slice(0, MAX_LECTURAS_LOG))
        setSeries((prev) => ({ ...prev, [d.nodo]: fusionar(prev[d.nodo], [aPunto(d)]) }))
        break
      }
      case 'estados':
        setEstados(listaAObjeto(d))
        break
      case 'estado':
        setEstados((prev) => ({ ...prev, [d.nodo]: d }))
        agregarBitacora([entrada('estado', Date.parse(d.desde) || Date.now(), d.nodo, d)])
        break
      case 'cargas':
        setCargas(listaAObjeto(d))
        break
      case 'carga':
        setCargas((prev) => ({ ...prev, [d.nodo]: d }))
        agregarBitacora([entrada('carga', Date.parse(d.desde) || Date.now(), d.nodo, d)])
        break
      case 'evento':
        agregarBitacora([entrada('evento', Date.parse(d.registrado) || Date.now(), null, d)])
        break
      case 'backfill':
        agregarBitacora([entrada('backfill', Date.now(), d.nodo, d)])
        cargarHistorial([d.nodo])
        break
      case 'meta':
        setMetadatos((prev) => ({ ...prev, [d.nodo]: { nombre: d.nombre, ubicacion: d.ubicacion } }))
        break
      case 'alerta_ia':
        alertaIARef.current?.(d)
        break
      default:
        break
    }
  }, [agregarBitacora, cargarDatosIniciales, cargarHistorial])

  // La referencia evita reconectar el WebSocket cada vez que cambia "procesar".
  const alertaIARef = useRef(onAlertaIA)
  useEffect(() => { alertaIARef.current = onAlertaIA }, [onAlertaIA])
  const procesarRef = useRef(procesar)
  useEffect(() => { procesarRef.current = procesar }, [procesar])
  const sesionInvalidaRef = useRef(onSesionInvalida)
  useEffect(() => { sesionInvalidaRef.current = onSesionInvalida }, [onSesionInvalida])

  useEffect(() => {
    if (!urlBackend || !token) return undefined
    let cancelado = false
    let ws = null
    let temporizador = null
    let espera = 1000

    const programarReintento = () => {
      temporizador = setTimeout(conectar, espera)
      espera = Math.min(espera * 2, 15_000)
    }

    function conectar() {
      try {
        ws = new WebSocket(urlWebSocket(urlBackend, token))
      } catch {
        programarReintento()
        return
      }
      ws.onopen = () => { espera = 1000; setConectado(true) }
      ws.onclose = (e) => {
        setConectado(false)
        if (e.code === 4401) { sesionInvalidaRef.current?.(); return }   // no reintentar
        if (!cancelado) programarReintento()
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (evento) => {
        let msg
        try { msg = JSON.parse(evento.data) } catch { return }
        procesarRef.current(msg)
      }
    }

    // Al cambiar de servidor se limpia lo del servidor anterior.
    setLecturas({}); setEstados({}); setCargas({}); setSeries({}); setMetadatos({})
    setPaquetes([]); setBitacora([])
    conectar()
    return () => {
      cancelado = true
      clearTimeout(temporizador)
      if (ws) { ws.onclose = null; ws.close() }
      setConectado(false)
    }
  }, [urlBackend, token])

  // Estado del broker MQTT (lo informa GET / del backend).
  useEffect(() => {
    if (!conectado) { setMqttConectado(null); return undefined }
    let vigente = true
    const consultar = () => api.salud(urlBackend)
      .then((r) => vigente && setMqttConectado(Boolean(r.mqtt_conectado)))
      .catch(() => vigente && setMqttConectado(null))
    consultar()
    const id = setInterval(consultar, INTERVALO_SALUD_MS)
    return () => { vigente = false; clearInterval(id) }
  }, [conectado, urlBackend])

  const actualizarMetadatoLocal = useCallback((nodo, datos) => {
    setMetadatos((prev) => ({ ...prev, [nodo]: datos }))
  }, [])

  return {
    conectado, mqttConectado, lecturas, estados, cargas, metadatos,
    series, paquetes, bitacora, actualizarMetadatoLocal,
  }
}
