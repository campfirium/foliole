import { spawn } from 'node:child_process';
import process from 'node:process';

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
    try {
      const response = await globalThis.fetch(VITE_URL, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
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

const vite = run('npm', ['run', 'dev']);
await waitForViteReady();

const electron = run('npx', ['electron', 'electron-dist/main.js'], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    ELECTRON_RENDERER_URL: VITE_URL
  }
});

const shutdown = () => {
  if (!vite.killed) {
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

vite.on('exit', () => {
  shutdown();
});

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
