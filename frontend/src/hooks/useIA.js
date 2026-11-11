// Predicción y alertas de los modelos de IA (backend v0.4).
// Se consultan cada 5 minutos (el backend las recalcula con esa frecuencia);
// las alertas nuevas también llegan al instante por el WebSocket.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const REFRESCO_MS = 5 * 60_000

const ordenar = (lista) => [...lista].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))

export default function useIA(urlBackend, conectado) {
  const [prediccion, setPrediccion] = useState(null)
  const [errorPrediccion, setErrorPrediccion] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [activo, setActivo] = useState(null)   // null = aún no se sabe

  const refrescar = useCallback(() => {
    api.prediccion(urlBackend)
      .then((r) => { setPrediccion(r); setErrorPrediccion(null) })
      .catch((e) => setErrorPrediccion(e.estado === 404
        ? 'El servidor todavía no tiene los modelos de IA'
        : 'No se pudo consultar la predicción'))
    api.alertas(urlBackend, 300, 30)
      .then((r) => { setAlertas(ordenar(r.alertas || [])); setActivo(Boolean(r.activo)) })
      .catch(() => {})
  }, [urlBackend])

  useEffect(() => {
    if (!conectado) return undefined
    refrescar()
    const id = setInterval(refrescar, REFRESCO_MS)
    return () => clearInterval(id)
  }, [conectado, refrescar])

  // Alerta recibida por el WebSocket ({"type": "alerta_ia"})
  const agregarAlerta = useCallback((alerta) => {
    if (!alerta?.id) return
    setAlertas((prev) => (prev.some((a) => a.id === alerta.id) ? prev : ordenar([alerta, ...prev])))
  }, [])

  return { prediccion, errorPrediccion, alertas, activo, agregarAlerta, refrescar }
}
