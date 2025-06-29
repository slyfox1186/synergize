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
          primary: '#FFD93D',     // LIGHTNING YELLOW - Maximum visibility
          secondary: '#FF6B35',   // SUNSET BURST - Power orange
          accent: '#6BCF7F',      // EMERALD GLOW - Success green
          dark: '#34495E',        // STEEL BLUE - Professional depth
          darker: '#2C3E50',      // EXECUTIVE SLATE - Sophisticated base
          light: '#41576B',       // GUNMETAL - Elevated containers
          text: '#FFFFFF',        // PURE WHITE - Maximum clarity
          muted: '#E0E0E0'        // SILVER - Subtle elements
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