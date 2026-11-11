// Consumo de hoy hora por hora, en barras apiladas por aparato.
// Las horas que aún no han pasado se ven rayadas, para que no parezcan
// consumo cero. Al pasar el mouse (o tocar) una barra se ve el detalle.
import { useMemo, useState } from 'react'
import { fmtMoneda, fmtNumero } from '../lib/formato.js'

// horas: respuesta de /api/energia?periodo=hoy -> [{ inicio, valores: { nodo_1: kWh, ... } }]
export default function BarrasHora({ horas = [], nodos = [], tarifaKwh, enPesos = true, altura = 180 }) {
  const [activa, setActiva] = useState(null)

  const datos = useMemo(() => {
    const porHora = Array.from({ length: 24 }, (_, h) => ({ h, valores: {}, total: 0 }))
    for (const fila of horas) {
      const h = new Date(fila.inicio).getHours()
      for (const [nodo, kwh] of Object.entries(fila.valores || {})) {
        porHora[h].valores[nodo] = (porHora[h].valores[nodo] || 0) + kwh
        porHora[h].total += kwh
      }
    }
    return porHora
  }, [horas])

  const horaActual = new Date().getHours()
  const factor = enPesos ? tarifaKwh : 1
  const maximo = Math.max(...datos.map((d) => d.total * factor), enPesos ? 50 : 0.05)
  // Escala con un valor redondo arriba
  const paso = enPesos ? (maximo > 200 ? 100 : 50) : (maximo > 0.2 ? 0.1 : 0.05)
  const tope = Math.ceil(maximo / paso) * paso
  const marcas = [0, tope / 2, tope]
  const formato = (v) => (enPesos ? fmtMoneda(v) : `${fmtNumero(v, 2)} kWh`)
  const detalle = activa != null ? datos[activa] : null

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-xs text-slate-500 num text-right w-12 flex-shrink-0" style={{ height: altura }}>
          {[...marcas].reverse().map((m) => <span key={m} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{formato(m)}</span>)}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden="true">
            {marcas.map((m) => <span key={m} className="border-t border-slate-100"></span>)}
          </div>
          <div className="relative flex items-end gap-[3px]" style={{ height: altura }} onMouseLeave={() => setActiva(null)}>
            {datos.map((d) => {
              const futura = d.h > horaActual
              return (
                <button
                  key={d.h}
                  type="button"
                  onMouseEnter={() => setActiva(d.h)}
                  onFocus={() => setActiva(d.h)}
                  onClick={() => setActiva(d.h)}
                  aria-label={`${d.h}:00, ${futura ? 'aún no pasa' : formato(d.total * factor)}`}
                  className={`flex-1 h-full flex flex-col-reverse rounded-t-[3px] overflow-hidden ${activa === d.h ? 'opacity-100' : activa != null ? 'opacity-60' : ''}`}
                >
                  {futura ? (
                    <span className="w-full h-1/3 rayado rounded-t-[3px]"></span>
                  ) : (
                    nodos.map((n) => {
                      const v = (d.valores[n.id] || 0) * factor
                      if (v <= 0) return null
                      return <span key={n.id} className="w-full border-t border-white/70" style={{ height: `${(v / tope) * 100}%`, backgroundColor: n.color }}></span>
                    })
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-slate-500 num mt-1.5">
            <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span>
          </div>
        </div>
      </div>

      <div className="mt-3 min-h-[2.75rem] text-[13px]">
        {detalle ? (
          <div>
            <p className="font-semibold text-slate-900 num">
              De {detalle.h}:00 a {detalle.h + 1}:00: {detalle.h > horaActual ? 'aún no pasa' : formato(detalle.total * factor)}
            </p>
            <p className="text-slate-500 flex flex-wrap gap-x-3">
              {nodos.filter((n) => detalle.valores[n.id] > 0).map((n) => (
                <span key={n.id} className="inline-flex items-center gap-1.5 num">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: n.color }}></span>
                  {n.nombre} {formato(detalle.valores[n.id] * factor)}
                </span>
              ))}
            </p>
          </div>
        ) : (
          <p className="text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
            {nodos.map((n) => (
              <span key={n.id} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: n.color }}></span>
                {n.nombre}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}
