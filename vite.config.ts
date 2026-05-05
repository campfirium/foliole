import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSharedViteConfig } from './vite.shared';

const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default createSharedViteConfig(PROJECT_ROOT);
