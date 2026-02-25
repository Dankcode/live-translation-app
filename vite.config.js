import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        overlay: 'overlay.html',
        satellite: 'satellite.html',
        history: 'history.html',
      }
    }
  }
})
