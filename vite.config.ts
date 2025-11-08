import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/VCB--S-chat/',
  server: {
    proxy: {
      '/api/tts': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/tts/, '/tts-stream')
      },
      '/api/detect-language': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/detect-language/, '/detect-language')
      }
    }
  }
})
