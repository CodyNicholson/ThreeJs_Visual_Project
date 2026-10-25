import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser-only lab: no API proxy. Three.js core is ~1 MB unminified, so raise the chunk warning;
// the WebGPU build is split out and only loads on the WebGPU page.
export default defineConfig({
  plugins: [react()],
  // Dev server listens on localhost only; inside Docker pass `--host 0.0.0.0` (see README)
  server: {
    port: 3000
  },
  build: {
    chunkSizeWarningLimit: 1800
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    testTimeout: 20000
  }
});
