import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8913';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': apiTarget,
      '/vitessce': apiTarget,
      '/data/generated': apiTarget,
    },
  },
  preview: {
    host: '127.0.0.1',
    proxy: {
      '/api': apiTarget,
      '/vitessce': apiTarget,
      '/data/generated': apiTarget,
    },
  },
});
