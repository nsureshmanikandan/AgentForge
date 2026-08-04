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
        // Architect's plan-generation call can legitimately run past a
        // minute against a reasoning model with a large max_completion_tokens
        // budget -- Node's default proxy/socket timeout was cutting the
        // connection with net::ERR_ABORTED well before Azure finished
        // responding. Both timeout (incoming client socket) and proxyTimeout
        // (proxy-to-target socket) need raising; the frontend's own axios
        // timeout (src/api/client.ts) is already 180000ms.
        timeout: 180000,
        proxyTimeout: 180000,
      },
    },
  },
})
