/* global console, process */

import { spawn } from 'node:child_process';

export function runInherited(bin, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('error', (error) => {
      console.error(`[android-host] failed to start ${bin}: ${error.message}`);
      resolve(1);
    });
    child.on('close', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

export function spawnDetached(bin, args, options = {}) {
  const child = spawn(bin, args, {
    cwd: options.cwd ?? process.cwd(),
    detached: true,
    env: options.env ?? process.env,
    shell: false,
    stdio: 'ignore',
    windowsHide: false
  });
  child.unref();
  return child;
}
