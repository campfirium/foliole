import fs from 'node:fs';

import { resolveRendererIndexPath } from './runtimePaths.js';

export function resolveRendererFilePath(runtimeDir: string) {
  return resolveRendererIndexPath(runtimeDir, fs.existsSync);
}
