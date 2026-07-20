import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发环境将 /api 与 /media 代理到 Django 后端，免去跨域配置
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
