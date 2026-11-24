import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
  },
  server: {
    host: true,
    port: 5173,
  },
});
