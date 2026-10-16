import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL('../', import.meta.url)),
  envPrefix: 'VITE_',
  server: {
    port: 5173,
    strictPort: true,
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
