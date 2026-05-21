import { spawn } from 'node:child_process';
import process from 'node:process';

import { createElectronLaunchEnv } from './electron-dev-env.mjs';
import { isViteServerReady } from './electron-dev-server.mjs';

const VITE_HOST = '127.0.0.1';
const VITE_PORT_DEFAULT = 24600;
const VITE_PORT_MAX_ATTEMPTS = 8;

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
}

function createElectronArgs(entryPath) {
  const args = ['electron'];
  if (process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION === '1') {
    args.push('--disable-gpu', '--disable-gpu-compositing', '--disable-gpu-sandbox');
  }
  args.push(entryPath);
  return args;
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

function resolveViteUrl(port) {
  return `http://${VITE_HOST}:${port}`;
}

async function startViteWithPortFallback() {
  const preferredPort = resolveRequestedPort();
  const candidatePorts = new Set([preferredPort]);
  for (let offset = 0; offset < VITE_PORT_MAX_ATTEMPTS; offset += 1) {
    candidatePorts.add(preferredPort + 100 + offset);
    candidatePorts.add(5173 + offset);
    candidatePorts.add(3000 + offset);
  }

  for (const port of candidatePorts) {
    const viteUrl = resolveViteUrl(port);
    if (await isViteServerReady(viteUrl)) {
      return { viteUrl, viteProc: null };
    }

    const viteProc = run('npm', ['run', 'dev'], {
      env: {
        ...process.env,
        FOLIOLE_VITE_PORT: String(port)
      }
    });

    const maxAttempts = 24;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (await isViteServerReady(viteUrl)) {
        return { viteUrl, viteProc };
      }
      if (viteProc.exitCode !== null) {
        break;
      }
      await wait(500);
    }

    if (!viteProc.killed && viteProc.exitCode === null) {
      viteProc.kill('SIGTERM');
      await wait(250);
    }
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

const viteState = await startViteWithPortFallback();
const vite = viteState.viteProc;

const electron = run('npx', createElectronArgs('electron-dist/electron/main.js'), {
  env: createElectronLaunchEnv(process.env, viteState.viteUrl)
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
