#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolvePackagedUninstallerPath(env = process.env) {
  const override = env.FOLIOLE_UNINSTALLER_PATH?.trim();
  if (override) return path.resolve(override);
  const localAppData = env.LOCALAPPDATA?.trim();
  return localAppData ? path.join(localAppData, 'Programs', 'Foliole', 'Uninstall Foliole.exe') : null;
}

export async function uninstallPackagedApp(options = {}) {
  const uninstallerPath = options.uninstallerPath ?? resolvePackagedUninstallerPath(options.env);
  if (!uninstallerPath || !(options.exists ?? existsSync)(uninstallerPath)) {
    throw new Error('Installed Foliole uninstaller was not found.');
  }
  await new Promise((resolvePromise, reject) => {
    const child = (options.spawn ?? spawn)(uninstallerPath, ['/currentuser', '/S'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`Foliole uninstall failed with exit code ${code ?? 'unknown'}.`)));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await uninstallPackagedApp();
  console.log('[foliole-uninstall] status: UNINSTALLED');
}
