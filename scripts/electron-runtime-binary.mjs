/* global process */

import { createRequire } from 'node:module';
import path from 'node:path';

export function ensureElectronBinary(repoRoot = process.cwd(), loadElectron) {
  const resolveElectron = loadElectron ?? createRequire(path.join(repoRoot, 'package.json'));
  const electronPath = resolveElectron('electron');
  if (typeof electronPath !== 'string' || electronPath.length === 0) {
    throw new Error('Electron package did not resolve an executable path.');
  }
  return electronPath;
}
