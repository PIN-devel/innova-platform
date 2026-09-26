import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
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
