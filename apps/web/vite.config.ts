import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  server: {
    port: mode === 'api' ? 5174 : 5173,
    strictPort: true,
    proxy: mode === 'api'
      ? {
          '/api': {
            target: 'http://127.0.0.1:3000',
            changeOrigin: true,
          },
        }
      : undefined,
  },
}))
