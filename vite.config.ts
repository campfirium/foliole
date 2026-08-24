import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSharedViteConfig, DESKTOP_RENDERER_WARMUP_FILES } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default createSharedViteConfig(PROJECT_ROOT, {
  build: {
    emptyOutDir: true,
    outDir: path.resolve(PROJECT_ROOT, 'dist/desktop')
  },
  pdfJsResources: true,
  warmupClientFiles: DESKTOP_RENDERER_WARMUP_FILES
});
