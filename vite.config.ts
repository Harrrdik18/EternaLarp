import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.')
  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return {
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: runtimeEnv?.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  }
})
