import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Architect's plan/UI-generation calls can legitimately run past a
        // minute against a reasoning model with a large max_completion_tokens
        // budget (and can retry once server-side on an empty response --
        // see architect.py), which was hitting Node's default proxy/socket
        // timeout well before Azure finished responding. Must stay >= the
        // frontend's own axios timeout (src/api/client.ts, currently 300000ms)
        // or the proxy would cut the connection before axios ever gets the
        // chance to.
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
})
