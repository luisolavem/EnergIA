/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#22d3ee', // cian: remite a "electricidad / datos en vivo"
          dim: '#0e7490',
        },
      },
    },
  },
  plugins: [],
}
