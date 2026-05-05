import { spawn } from 'node:child_process';
import process from 'node:process';

import { createElectronLaunchEnv } from './electron-dev-env.mjs';
import { isViteServerReady } from './electron-dev-server.mjs';

const VITE_HOST = '127.0.0.1';
const VITE_PORT_DEFAULT = 5173;
const VITE_PORT_MAX_ATTEMPTS = 5;

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

function resolveRequestedPort() {
  const raw = process.env.FOLIOLE_VITE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return VITE_PORT_DEFAULT;
}

function buildViteUrl(port) {
  return `http://${VITE_HOST}:${port}`;
}

async function waitForViteReady(viteUrl, maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isViteServerReady(viteUrl)) {
      return;
    }
    await wait(500);
  }
  throw new Error('vite dev server did not become ready');
}

async function startViteWithPortFallback() {
  const requestedPort = resolveRequestedPort();
  const candidates = new Set();
  for (let attempt = 0; attempt < VITE_PORT_MAX_ATTEMPTS; attempt += 1) {
    candidates.add(requestedPort + attempt);
  }
  for (let attempt = 0; attempt < VITE_PORT_MAX_ATTEMPTS; attempt += 1) {
    candidates.add(5173 + attempt);
  }
  for (let attempt = 0; attempt < VITE_PORT_MAX_ATTEMPTS; attempt += 1) {
    candidates.add(3000 + attempt);
  }

  const portsToTry = [...candidates];
  for (const port of portsToTry) {
    const viteUrl = buildViteUrl(port);
    if (await isViteServerReady(viteUrl)) {
      return { port, url: viteUrl, proc: null };
    }

    const proc = run('npm', ['run', 'dev'], {
      env: { ...process.env, FOLIOLE_VITE_PORT: String(port) }
    });

    try {
      await waitForViteReady(viteUrl);
      return { port, url: viteUrl, proc };
    } catch {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
      await wait(250);
    }
  }

  throw new Error('vite dev server did not start');
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

const viteState = await startViteWithPortFallback();
const vite = viteState.proc;

const electron = run('npx', ['electron', 'electron-dist/main.js'], {
  env: createElectronLaunchEnv(process.env, viteState.url)
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
