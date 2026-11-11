// Preferencias del usuario guardadas en el navegador (sobreviven a recargas):
// dirección del backend, tarifa del kWh, tema de color ('auto' sigue al sistema),
// potencia en kW y si se muestran los avisos de aparatos sin conexión.
import { useCallback, useState } from 'react'
import { TARIFA_KWH_POR_DEFECTO, TEMAS, TEMA_POR_DEFECTO, URL_BACKEND_POR_DEFECTO, limpiarUrl } from '../config.js'

const CLAVE = 'energia.preferencias'

function leer() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE) || '{}')
    const tarifa = Number(guardadas.tarifaKwh)
    return {
      urlBackend: limpiarUrl(guardadas.urlBackend) || URL_BACKEND_POR_DEFECTO,
      tarifaKwh: tarifa > 0 ? tarifa : TARIFA_KWH_POR_DEFECTO,
      tema: guardadas.tema === 'auto' || TEMAS.some((t) => t.id === guardadas.tema) ? guardadas.tema : TEMA_POR_DEFECTO,
      potenciaKw: Boolean(guardadas.potenciaKw),
      avisos: guardadas.avisos !== false,
    }
  } catch {
    return { urlBackend: URL_BACKEND_POR_DEFECTO, tarifaKwh: TARIFA_KWH_POR_DEFECTO, tema: TEMA_POR_DEFECTO, potenciaKw: false, avisos: true }
  }
}

export default function usePreferencias() {
  const [preferencias, setPreferencias] = useState(leer)

  const guardar = useCallback((nuevas) => {
    setPreferencias((prev) => {
      const siguiente = { ...prev, ...nuevas }
      try { localStorage.setItem(CLAVE, JSON.stringify(siguiente)) } catch { /* modo privado */ }
      return siguiente
    })
  }, [])

  return [preferencias, guardar]
}
