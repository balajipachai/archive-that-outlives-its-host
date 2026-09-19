import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const PUBLISHER_PORT = process.env.PUBLISHER_PORT ?? '4310'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${PUBLISHER_PORT}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist-web',
  },
})
