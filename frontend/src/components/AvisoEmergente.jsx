// Aviso flotante cuando llega una alerta nueva de la IA por el WebSocket.
// Se cierra solo a los 10 segundos.
import { useEffect } from 'react'
import { Icono, PuntoAparato } from './ui.jsx'

const DURACION_MS = 10_000

// id: identifica la alerta (el temporizador se reinicia solo si cambia de alerta)
export default function AvisoEmergente({ id, aviso, onCerrar, onVer }) {
  useEffect(() => {
    if (!id) return undefined
    const temporizador = setTimeout(onCerrar, DURACION_MS)
    return () => clearTimeout(temporizador)
  }, [id, onCerrar])

  if (!aviso) return null
  return (
    <div role="status" aria-live="polite"
      className="fixed z-50 right-4 left-4 sm:left-auto sm:w-[380px] bottom-20 md:bottom-6 bg-white rounded-xl border border-slate-200 border-l-[3px] border-l-amber-500 shadow-[0_8px_24px_rgba(15,23,42,0.14)] p-4">
      <div className="flex items-start gap-3">
        <PuntoAparato color={aviso.color} className="mt-1.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{aviso.titulo}</p>
          <p className="text-[13px] text-slate-600 mt-0.5">{aviso.texto}</p>
          {onVer && (
            <button type="button" onClick={() => { onVer(); onCerrar() }}
              className="mt-2 text-[13px] font-medium text-primario-700 hover:text-primario-800">
              Ver detalle
            </button>
          )}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="text-slate-400 hover:text-slate-700">
          <Icono nombre="cerrar" className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
