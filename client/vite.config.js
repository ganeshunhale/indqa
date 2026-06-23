import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Define PostCSS inline (empty) so Vite does not walk up the directory tree
  // and accidentally pick up an unrelated postcss config from a parent folder.
  css: {
    postcss: { plugins: [] },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
