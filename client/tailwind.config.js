/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07080b', 900: '#0b0d12', 850: '#10131a', 800: '#151922', 700: '#1e2330', 600: '#2a3142', 500: '#3b4459' },
        saffron: { 300: '#ffd27a', 400: '#ffb84d', 500: '#ff9f1c', 600: '#e5820a' },
        teal: { 300: '#7ff5ea', 400: '#2ee6d6', 500: '#14c9ba', 600: '#0ea597' },
        rose: { 400: '#ff6b8b', 500: '#f43f5e' },
        lime: { 400: '#a3e635' },
        paypal: { blue: '#0070ba', dark: '#003087', light: '#009cde', gold: '#ffc439' },
        fog: { 100: '#eef1f7', 300: '#b8c0d2', 400: '#8d97ad', 500: '#6b7590' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(255,159,28,0.55)',
        teal: '0 0 40px -10px rgba(46,230,214,0.5)',
      },
      keyframes: {
        drift: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(4%,-3%) scale(1.08)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { drift: 'drift 18s ease-in-out infinite', shimmer: 'shimmer 1.6s infinite' },
    },
  },
  plugins: [],
};
