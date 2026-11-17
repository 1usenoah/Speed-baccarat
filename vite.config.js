import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Speed-baccarat/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1600
  },
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true
  }
});
