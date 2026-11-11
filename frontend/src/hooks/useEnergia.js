// kWh consumidos por nodo en el periodo elegido ("hoy" o "semana").
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const REFRESCO_MS = 60_000

export default function useEnergia(urlBackend, periodo, conectado) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!conectado) return undefined
    let vigente = true
    const consultar = () => {
      setCargando(true)
      api.energia(urlBackend, periodo)
        .then((r) => { if (vigente) { setDatos(r); setError(null) } })
        .catch(() => { if (vigente) setError('No se pudo calcular la energía') })
        .finally(() => { if (vigente) setCargando(false) })
    }
    setDatos(null)
    consultar()
    const id = setInterval(consultar, REFRESCO_MS)
    return () => { vigente = false; clearInterval(id) }
  }, [urlBackend, periodo, conectado])

  return { datos, cargando, error }
}
