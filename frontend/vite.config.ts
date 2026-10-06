import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/QUESTION-MIND-FRONTEND/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
