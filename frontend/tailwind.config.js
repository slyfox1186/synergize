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
          // PRIMARY ACCENTS - Electric Blue & Orange Theme
          primary: '#1E90FF',     // ELECTRIC BLUE - Primary interactive elements
          secondary: '#FF8C00',   // VIVID AMBER - Secondary accents & CTAs
          accent: '#4CD964',      // BRIGHT GREEN - Success states
          
          // BACKGROUND SYSTEM - Premium dark with depth
          darker: '#121212',      // RICH CHARCOAL - Main background
          dark: '#1A1A1A',        // ELEVATED CHARCOAL - Card backgrounds
          light: '#232323',       // LIGHTER CHARCOAL - Hover states
          
          // TEXT HIERARCHY
          text: '#F0F0F0',        // OFF-WHITE - Primary text
          muted: '#A8A8A8',       // MID-GRAY - Secondary text
          
          // SEMANTIC COLORS
          error: '#FF4433',       // BOLD RED - Error states
          warning: '#FF8C00',     // AMBER - Warning states
          success: '#4CD964',     // GREEN - Success feedback
          
          // GLOW EFFECTS
          'glow-blue': '#1E90FF',
          'glow-orange': '#FF8C00'
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