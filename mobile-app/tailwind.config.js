/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Krish Academia Brand Colors
        krish: {
          pink: '#E91E8C',
          purple: '#4A2C7B',
          gold: '#F59E0B',
          orange: '#FF6B35',
          blue: '#3B82F6',
          cream: '#FFF9F0',
        },
        primary: {
          50: '#fdf2f8',
          100: '#fce7f3',
          500: '#E91E8C',
          600: '#DB2777',
          700: '#BE185D',
        },
        secondary: {
          50: '#faf5ff',
          100: '#f3e8ff',
          500: '#4A2C7B',
          600: '#7C3AED',
          700: '#6D28D9',
        },
        accent: {
          gold: '#F59E0B',
          orange: '#FF6B35',
          yellow: '#FCD34D',
        },
        'dark-bg': '#1e1b4b',
        'dark-card': '#2e2a5c',
        'dark-input': '#3d3970',
      },
      scale: {
        '102': '1.02',
      },
    },
  },
  plugins: [],
}
