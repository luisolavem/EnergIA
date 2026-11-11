// Hora actual que se refresca sola: permite que "hace 30 s" o el paso a
// "Sin datos recientes" se actualicen aunque no lleguen mensajes nuevos.
import { useEffect, useState } from 'react'

export default function useAhora(intervaloMs = 5000) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])
  return ahora
}
