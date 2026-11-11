// Tema activo, disponible para cualquier componente sin pasarlo por props.
// Lo usan las gráficas, porque recharts necesita colores fijos.
import { createContext, useContext } from 'react'
import { TEMAS } from '../config.js'

export const TemaContext = createContext(TEMAS[0])

export const useTema = () => useContext(TemaContext)
