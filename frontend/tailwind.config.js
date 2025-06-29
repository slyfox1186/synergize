/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        synergy: {
          primary: '#00d4ff',
          secondary: '#ff6b00',
          accent: '#ffd700',
          dark: '#0a0a0a',
          darker: '#050505',
          light: '#1a1a1a',
          text: '#e0e0e0',
          muted: '#808080'
        }
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'stream-in': 'stream-in 0.3s ease-out',
        'phase-transition': 'phase-transition 0.5s ease-in-out'
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 }
        },
        'stream-in': {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        'phase-transition': {
          '0%': { opacity: 0, transform: 'scale(0.95)' },
          '100%': { opacity: 1, transform: 'scale(1)' }
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Consolas', 'monospace'],
        'tech': ['Orbitron', 'sans-serif']
      }
    },
  },
  plugins: [],
}