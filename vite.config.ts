import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeConfig } from 'vite';

import { buildSourcePlugin } from './scripts/vite/buildSource.ts';
import { createSharedViteConfig, DESKTOP_RENDERER_WARMUP_FILES } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  createSharedViteConfig(PROJECT_ROOT, {
    build: {
      emptyOutDir: true,
      outDir: path.resolve(PROJECT_ROOT, 'dist/desktop')
    },
    pdfJsResources: true,
    warmupClientFiles: DESKTOP_RENDERER_WARMUP_FILES
  }),
  {
    plugins: [buildSourcePlugin(PROJECT_ROOT)],
    optimizeDeps: {
      // React-PDF loads the PDF.js core before its LinkService imports the viewer.
      // Pre-bundling React-PDF can hoist the viewer ahead of that initialization.
      exclude: ['react-pdf'],
      include: ['react-pdf > warning']
    }
  }
);
