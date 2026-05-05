import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, mergeConfig } from 'vite';

import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT),
  defineConfig({
    root: path.resolve(PROJECT_ROOT, 'src/companion'),
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/companion')
    }
  })
);
