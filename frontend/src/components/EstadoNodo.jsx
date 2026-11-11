// Estado técnico del nodo (vista del técnico). Siempre con texto además del color.
import { ESTADO } from '../lib/nodos.js'
import { Pastilla } from './ui.jsx'

const ESTADOS = {
  [ESTADO.ACTIVO]: { texto: 'En línea', tono: 'ok' },
  [ESTADO.SIN_CARGA]: { texto: 'Sin carga', tono: 'neutro' },
  [ESTADO.SIN_DATOS]: { texto: 'Sin datos recientes', tono: 'aviso' },
  [ESTADO.DESCONECTADO]: { texto: 'Desconectado', tono: 'falla' },
}

export default function EstadoNodo({ estado }) {
  const e = ESTADOS[estado] || ESTADOS[ESTADO.SIN_DATOS]
  return <Pastilla tono={e.tono}>{e.texto}</Pastilla>
}
