import { spawn } from 'node:child_process';
import process from 'node:process';

import { createElectronLaunchEnv } from './electron-dev-env.mjs';
import { isViteServerReady } from './electron-dev-server.mjs';

const VITE_URL = 'http://127.0.0.1:4600';

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function waitForViteReady(maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isViteServerReady(VITE_URL)) {
      return;
    }
    await wait(500);
  }
  throw new Error('vite dev server did not become ready');
}

const compile = run('npm', ['run', 'electron:compile']);
await new Promise((resolve, reject) => {
  compile.on('exit', (code) => {
    if (code === 0) {
      resolve(undefined);
      return;
    }
    reject(new Error(`electron compile failed with code ${code ?? 'null'}`));
  });
});

let vite = null;
if (!(await isViteServerReady(VITE_URL))) {
  vite = run('npm', ['run', 'dev']);
  await waitForViteReady();
}

const electron = run('npx', ['electron', 'electron-dist/main.js'], {
  env: createElectronLaunchEnv(process.env, VITE_URL)
});

const shutdown = () => {
  if (vite && !vite.killed) {
    vite.kill('SIGTERM');
  }
  if (!electron.killed) {
    electron.kill('SIGTERM');
  }
};

electron.on('exit', (code) => {
  shutdown();
  process.exit(code ?? 0);
});

if (vite) {
  vite.on('exit', () => {
    shutdown();
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
