/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pokemon: { DEFAULT: '#14b8a6', light: '#99f6e4', dark: '#0f766e' },
        onepiece: { DEFAULT: '#a855f7', light: '#e9d5ff', dark: '#7e22ce' },
        brand: { DEFAULT: '#6366f1', light: '#e0e7ff', dark: '#4338ca' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
