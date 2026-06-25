import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy error handler: ECONNRESET/ECONNABORTED are normal when a proxied
// WebSocket is torn down (startup race, HMR reload, Socket.IO reconnect), so we
// swallow those and surface only genuine proxy errors as a concise one-liner.
const onProxyError = (label) => (proxy) =>
  proxy.on('error', (err) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'ECONNABORTED') {
      console.warn(`[${label} proxy] ${err.message}`);
    }
  });

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
      '/api': { target: 'http://localhost:4000', configure: onProxyError('api') },
      '/socket.io': { target: 'http://localhost:4000', ws: true, configure: onProxyError('socket.io') },
    },
  },
});
