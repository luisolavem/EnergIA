// Raíz de la app: tema, sesión y, según el rol de la cuenta, el menú y las
// pantallas del residente o del técnico.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AvisoEmergente from './components/AvisoEmergente.jsx'
import ConfiguracionModal from './components/ConfiguracionModal.jsx'
import MenuPerfil from './components/MenuPerfil.jsx'
import { BarraLateral, BarraMovil, BarraSuperior } from './components/Navegacion.jsx'
import { Etiqueta } from './components/ui.jsx'
import { SECCIONES, TEMAS } from './config.js'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import useAhora from './hooks/useAhora.js'
import useEnergia from './hooks/useEnergia.js'
import useIA from './hooks/useIA.js'
import usePreferencias from './hooks/usePreferencias.js'
import { TemaContext } from './hooks/useTema.js'
import useTelemetria from './hooks/useTelemetria.js'
import { fechaLarga, usarPotenciaEnKw } from './lib/formato.js'
import { TIPOS_ALERTA, TIPOS_RESIDENTE, mensajeResidente } from './lib/ia.js'
import { construirNodos, estaEnLinea } from './lib/nodos.js'
import Login from './views/Login.jsx'
import Ajustes from './views/residente/Ajustes.jsx'
import Inicio from './views/residente/Inicio.jsx'
import MisAparatos from './views/residente/MisAparatos.jsx'
import AlertasIA from './views/tecnico/AlertasIA.jsx'
import Nodos from './views/tecnico/Nodos.jsx'
import Panel from './views/tecnico/Panel.jsx'
import Registros from './views/tecnico/Registros.jsx'

// Indicador de la cabecera del técnico: servidor -> broker MQTT -> nodos.
function estadoSistema(conectado, mqttConectado, nodos) {
  const enLinea = nodos.filter(estaEnLinea).length
  if (!conectado) return { tono: 'falla', texto: 'Servidor desconectado' }
  if (mqttConectado === false) return { tono: 'aviso', texto: 'Broker MQTT sin conexión' }
  if (nodos.length === 0) return { tono: 'aviso', texto: 'Sin nodos registrados' }
  if (enLinea === 0) return { tono: 'aviso', texto: 'Ningún nodo en línea' }
  if (enLinea < nodos.length) return { tono: 'aviso', texto: `${enLinea} de ${nodos.length} nodos en línea` }
  return { tono: 'ok', texto: `Los ${nodos.length} nodos en línea` }
}

function AppConSesion({ preferencias, guardarPreferencias }) {
  const { usuario, token, cerrarSesion } = useAuth()
  const esTecnico = usuario.rol === 'tecnico'
  const urlBackend = preferencias.urlBackend

  const sesionVencida = useCallback(() => cerrarSesion('Tu sesión venció. Vuelve a entrar.'), [cerrarSesion])
  // Alertas de la IA que llegan por el WebSocket: se agregan a la lista y se avisan en pantalla
  const alAlertaRef = useRef(null)
  const onAlertaIA = useCallback((alerta) => alAlertaRef.current?.(alerta), [])
  const telemetria = useTelemetria(urlBackend, { token, esTecnico, onSesionInvalida: sesionVencida, onAlertaIA })
  const ahora = useAhora(5000)
  const energiaHoy = useEnergia(urlBackend, 'hoy', telemetria.conectado)
  const energiaSemana = useEnergia(urlBackend, 'semana', telemetria.conectado)
  const ia = useIA(urlBackend, telemetria.conectado)
  const [avisoIA, setAvisoIA] = useState(null)
  const cerrarAvisoIA = useCallback(() => setAvisoIA(null), [])
  useEffect(() => {
    alAlertaRef.current = (alerta) => {
      ia.agregarAlerta(alerta)
      if (esTecnico || TIPOS_RESIDENTE.has(alerta.tipo)) setAvisoIA(alerta)
    }
  }, [ia.agregarAlerta, esTecnico])

  const secciones = SECCIONES[esTecnico ? 'tecnico' : 'residente']
  const [vista, setVista] = useState(secciones[0].id)
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null)
  const [configuracion, setConfiguracion] = useState(null) // null = cerrada

  const { lecturas, estados, cargas, metadatos } = telemetria
  const nodos = useMemo(
    () => construirNodos({ lecturas, estados, cargas, metadatos }, ahora),
    [lecturas, estados, cargas, metadatos, ahora],
  )

  const irANodo = (id) => { setNodoSeleccionado(id); setVista('nodos') }
  const abrirConfiguracion = (pestana = 'conexion', nodo = null) => setConfiguracion({ pestana, nodo })
  const cerrarConfiguracion = useCallback(() => setConfiguracion(null), [])

  const seccion = secciones.find((s) => s.id === vista)
  const estado = estadoSistema(telemetria.conectado, telemetria.mqttConectado, nodos)
  const comunes = { nodos, tarifaKwh: preferencias.tarifaKwh, conectado: telemetria.conectado, energiaHoy, energiaSemana, avisos: preferencias.avisos, ia }

  // Texto del aviso flotante (técnico: detalle; residente: en pesos y sencillo)
  const nodoAviso = avisoIA ? nodos.find((n) => n.id === avisoIA.nodo) : null
  const nombreAviso = nodoAviso?.nombre || avisoIA?.aparato
  const contenidoAviso = avisoIA && (esTecnico
    ? { color: nodoAviso?.color, titulo: `${nombreAviso}: ${(TIPOS_ALERTA[avisoIA.tipo] || TIPOS_ALERTA.inusual).texto.toLowerCase()}`, texto: avisoIA.descripcion }
    : { color: nodoAviso?.color, titulo: 'Aviso de consumo', texto: mensajeResidente(avisoIA, nombreAviso, preferencias.tarifaKwh) })
  // El Inicio trae su propio saludo; las demás pantallas llevan título.
  const conTitulo = vista !== 'inicio'

  return (
    <div className="h-screen bg-slate-50 flex text-slate-800 font-sans overflow-hidden">
      <BarraLateral
        secciones={secciones}
        vista={vista}
        onCambiarVista={setVista}
        usuario={usuario}
        onAbrirConfiguracion={() => abrirConfiguracion()}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <BarraSuperior
          grupo={seccion?.grupo}
          titulo={seccion?.titulo}
          perfil={(
            <MenuPerfil
              usuario={usuario}
              preferencias={preferencias}
              onGuardarPreferencias={guardarPreferencias}
              vista={vista}
              onIr={setVista}
              onAbrirConfiguracion={(pestana) => abrirConfiguracion(pestana)}
              onSalir={() => cerrarSesion()}
              urlBackend={urlBackend}
              conectado={telemetria.conectado}
            />
          )}
          estado={esTecnico
            ? <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
            : <Etiqueta tono={telemetria.conectado ? 'ok' : 'falla'}>{telemetria.conectado ? 'Medidor conectado' : 'Medidor sin conexión'}</Etiqueta>}
        />

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10 pt-6 md:pt-8 pb-24 md:pb-10">
          {conTitulo && (
            <div className="mb-6">
              <h1 className="text-2xl md:text-[28px] font-semibold text-slate-900 tracking-tight">{seccion?.titulo}</h1>
              <p className="text-sm text-slate-500 mt-1">{fechaLarga()}</p>
            </div>
          )}
          {vista === 'inicio' && <Inicio {...comunes} />}
          {vista === 'aparatos' && <MisAparatos {...comunes} />}
          {vista === 'ajustes' && (
            <Ajustes
              preferencias={preferencias}
              onGuardarPreferencias={guardarPreferencias}
              nodos={nodos}
              urlBackend={urlBackend}
              onMetadatoGuardado={telemetria.actualizarMetadatoLocal}
            />
          )}

          {esTecnico && vista === 'panel' && (
            <Panel {...comunes} series={telemetria.series} ahora={ahora} onSeleccionarNodo={irANodo} />
          )}
          {esTecnico && vista === 'nodos' && (
            <Nodos
              nodos={nodos}
              series={telemetria.series}
              ahora={ahora}
              nodoSeleccionado={nodoSeleccionado}
              setNodoSeleccionado={setNodoSeleccionado}
              onConfigurarNodo={(id) => abrirConfiguracion('nodos', id)}
              conectado={telemetria.conectado}
            />
          )}
          {esTecnico && vista === 'alertas' && (
            <AlertasIA
              ia={ia}
              nodos={nodos}
              tarifaKwh={preferencias.tarifaKwh}
              energiaSemana={energiaSemana}
              urlBackend={urlBackend}
              conectado={telemetria.conectado}
            />
          )}
          {esTecnico && vista === 'registros' && (
            <Registros paquetes={telemetria.paquetes} bitacora={telemetria.bitacora} nodos={nodos} />
          )}
        </div>
      </main>

      <BarraMovil
        secciones={secciones}
        vista={vista}
        onCambiarVista={setVista}
        usuario={usuario}
        onAbrirConfiguracion={() => abrirConfiguracion()}
      />

      <AvisoEmergente
        id={avisoIA?.id}
        aviso={contenidoAviso}
        onCerrar={cerrarAvisoIA}
        onVer={esTecnico ? () => setVista('alertas') : null}
      />

      {esTecnico && configuracion && (
        <ConfiguracionModal
          pestanaInicial={configuracion.pestana}
          nodoInicial={configuracion.nodo}
          preferencias={preferencias}
          onGuardarPreferencias={guardarPreferencias}
          nodos={nodos}
          metadatos={metadatos}
          onMetadatoGuardado={telemetria.actualizarMetadatoLocal}
          onCerrar={cerrarConfiguracion}
        />
      )}
    </div>
  )
}

function Contenido({ preferencias, guardarPreferencias }) {
  const { usuario, verificando } = useAuth()
  if (verificando) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">Abriendo EnergIA...</p>
      </div>
    )
  }
  if (!usuario) {
    return <Login urlBackend={preferencias.urlBackend} onCambiarServidor={(url) => guardarPreferencias({ urlBackend: url })} />
  }
  // key: al cambiar de cuenta se reinicia todo el estado de la app
  return <AppConSesion key={usuario.id} preferencias={preferencias} guardarPreferencias={guardarPreferencias} />
}

// "auto": sigue el modo claro u oscuro del celular o computador
function useSistemaOscuro() {
  const [consulta] = useState(() => (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null))
  const [oscuro, setOscuro] = useState(() => Boolean(consulta?.matches))
  useEffect(() => {
    if (!consulta) return undefined
    const cambio = (e) => setOscuro(e.matches)
    consulta.addEventListener?.('change', cambio)
    return () => consulta.removeEventListener?.('change', cambio)
  }, [consulta])
  return oscuro
}

export default function App() {
  const [preferencias, guardarPreferencias] = usePreferencias()
  const sistemaOscuro = useSistemaOscuro()
  usarPotenciaEnKw(preferencias.potenciaKw)

  // Tema: se marca en <html data-tema="..."> antes de pintar, sin parpadeo.
  const idTema = preferencias.tema === 'auto' ? (sistemaOscuro ? 'oscuro' : 'cian') : preferencias.tema
  const tema = TEMAS.find((t) => t.id === idTema) || TEMAS[0]
  useLayoutEffect(() => { document.documentElement.dataset.tema = tema.id }, [tema.id])

  return (
    <TemaContext.Provider value={tema}>
      <AuthProvider urlBackend={preferencias.urlBackend}>
        <Contenido preferencias={preferencias} guardarPreferencias={guardarPreferencias} />
      </AuthProvider>
    </TemaContext.Provider>
  )
}
