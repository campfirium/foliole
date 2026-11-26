import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: { open: false },
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) }
  }
});
