import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function resolveDevPort() {
  const raw = process.env.FOLIOLE_VITE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return 5173;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: resolveDevPort(),
    strictPort: true
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['tests/**', 'node_modules/**', 'dist/**'],
    setupFiles: './src/test/setup.ts',
    globals: true
  }
});
