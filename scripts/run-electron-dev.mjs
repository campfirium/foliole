/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolveElectronDevInvocation(platform = process.platform, nodeBin = process.execPath) {
  return {
    args: platform === 'darwin'
      ? ['scripts/macos/macos-electron-dev.mjs', 'start']
      : ['scripts/electron-dev.mjs'],
    bin: nodeBin
  };
}

export async function runElectronDev(options = {}) {
  const invocation = resolveElectronDevInvocation(options.platform, options.nodeBin);
  const child = spawn(invocation.bin, invocation.args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    shell: false,
    stdio: 'inherit'
  });
  return new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runElectronDev();
}
