/** @type {import('tailwindcss').Config} */

// Cada color apunta a una variable CSS definida en src/index.css.
// Así un tema cambia todos los colores de la interfaz sin tocar los componentes.
const escala = (nombre) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [
      n,
      `rgb(var(--${nombre}-${n}) / <alpha-value>)`,
    ]),
  )

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        primario: escala('primario'),     // botones, enlaces, íconos
        secundario: escala('secundario'), // menú activo, acciones principales
        slate: escala('slate'),           // grises: fondos, textos y bordes
        white: 'rgb(var(--blanco) / <alpha-value>)', // fondo de las tarjetas
        tinta: 'rgb(var(--tinta) / <alpha-value>)',  // cuadros oscuros de los íconos
      },
    },
  },
  plugins: [],
}
