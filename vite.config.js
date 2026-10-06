import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/camera-image/hcmc': {
        target: 'https://giaothong.hochiminhcity.gov.vn:8007',
        changeOrigin: true,
        secure: false,
        timeout: 8000,
        proxyTimeout: 8000,
        rewrite: (path) => path.replace(/^\/camera-image\/hcmc/, ''),
      },
      '/camera-image/legacy': {
        target: 'http://camera.thongtingiaothong.vn',
        changeOrigin: true,
        timeout: 5000,
        proxyTimeout: 5000,
        rewrite: (path) => path.replace(/^\/camera-image\/legacy/, ''),
      },
    },
  },
})
