import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // maplibre-gl завантажує свій tile-worker окремим чанком — Vite-прибандлення
  // (esbuild) ламає цей імпорт, тому виключаємо пакет з optimizeDeps.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
