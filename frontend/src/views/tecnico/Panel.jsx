// Panel técnico (antes "Dashboard"): potencia, energía y estado de los nodos.
import { useMemo, useState } from 'react'
import DonutChart from '../../components/DonutChart.jsx'
import NodeCard from '../../components/NodeCard.jsx'
import PotenciaAhora from '../../components/PotenciaAhora.jsx'
import { Indicador, Selector, Tarjeta, Vacio } from '../../components/ui.jsx'
import { fmtMoneda, fmtNumero } from '../../lib/formato.js'
import { ESTADO, estaEnLinea } from '../../lib/nodos.js'

const PERIODOS = { hoy: 'hoy', semana: 'en 7 días' }

export default function Panel({ nodos = [], series = {}, ahora, tarifaKwh, conectado, energiaHoy, energiaSemana, onSeleccionarNodo }) {
  const [filtroNodo, setFiltroNodo] = useState('todos')
  const [periodo, setPeriodo] = useState('hoy')
  const energia = periodo === 'hoy' ? energiaHoy : energiaSemana

  const visibles = useMemo(
    () => (filtroNodo === 'todos' ? nodos : nodos.filter((n) => n.id === filtroNodo)),
    [nodos, filtroNodo],
  )

  // Potencia actual: los nodos sin carga suman 0; los desconectados no suman.
  const conDato = visibles.filter((n) => n.potencia != null)
  const potenciaKw = visibles.reduce((acc, n) => acc + (n.potencia ?? 0), 0) / 1000
  const activos = visibles.filter((n) => n.estado === ESTADO.ACTIVO)
  const voltajePromedio = activos.length ? activos.reduce((acc, n) => acc + n.voltaje, 0) / activos.length : null
  const enLinea = visibles.filter(estaEnLinea).length

  const kwh = energia.datos
    ? (filtroNodo === 'todos' ? energia.datos.total_kwh : (energia.datos.nodos?.[filtroNodo] ?? 0))
    : null
  const notaEnergia = energia.error
    ? energia.error
    : kwh == null ? 'Calculando...' : `${fmtMoneda(kwh * tarifaKwh)} a ${fmtMoneda(tarifaKwh)} el kWh`

  const elementos = nodos.map((n) => ({ id: n.id, nombre: n.nombre, color: n.color, valor: energia.datos?.nodos?.[n.id] ?? 0 }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Selector value={filtroNodo} onChange={setFiltroNodo} etiqueta="Nodo">
          <option value="todos">Todos los nodos ({nodos.length})</option>
          {nodos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </Selector>
        <Selector value={periodo} onChange={setPeriodo} etiqueta="Periodo de energía">
          <option value="hoy">Energía de hoy</option>
          <option value="semana">Últimos 7 días</option>
        </Selector>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-5">
        <Indicador
          titulo="Potencia actual"
          icono="rayo"
          valor={conDato.length ? fmtNumero(potenciaKw, 2) : '--'}
          unidad="kW"
          nota={conDato.length ? 'Suma de lo que se consume ahora' : 'Sin lecturas actuales'}
        />
        <Indicador
          titulo={`Energía ${PERIODOS[periodo]}`}
          icono="calendario"
          valor={kwh == null ? '--' : fmtNumero(kwh, 2)}
          unidad="kWh"
          nota={notaEnergia}
        />
        <Indicador
          titulo="Voltaje promedio"
          icono="onda"
          valor={voltajePromedio == null ? '--' : fmtNumero(voltajePromedio, 1)}
          unidad="V"
          nota={activos.length ? `Medido en ${activos.length} ${activos.length === 1 ? 'nodo activo' : 'nodos activos'}` : 'Solo se mide con carga conectada'}
        />
        <Indicador
          titulo="Nodos en línea"
          icono="nodos"
          valor={enLinea}
          unidad={`de ${visibles.length}`}
          nota={`${activos.length} con aparato encendido`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        <Tarjeta className="lg:col-span-2" titulo="Potencia ahora" descripcion="Qué está consumiendo cada aparato en este momento.">
          <PotenciaAhora nodos={visibles} series={series} ahora={ahora} conectado={conectado} onSeleccionar={onSeleccionarNodo} />
        </Tarjeta>

        <Tarjeta titulo="Distribución por nodo" descripcion={`Energía consumida ${PERIODOS[periodo]}.`}>
          <DonutChart
            elementos={elementos}
            onSeleccionar={onSeleccionarNodo}
            textoVacio={energia.error || (energia.cargando || !energia.datos ? 'Calculando...' : 'Sin consumo registrado en este periodo.')}
          />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Nodos" descripcion="Toca uno para ver su diagnóstico.">
        {visibles.length === 0 ? (
          <Vacio>{conectado ? 'Ningún nodo ha reportado datos todavía.' : 'Sin conexión con el servidor.'}</Vacio>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
            {visibles.map((n) => <NodeCard key={n.id} nodo={n} series={series} ahora={ahora} onClick={() => onSeleccionarNodo(n.id)} />)}
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
