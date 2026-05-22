/* global console */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { createElectronLaunchEnv } from './electron-dev-env.mjs';
import { isViteServerReady, prewarmViteRendererEntries } from './electron-dev-server.mjs';

const VITE_HOST = '127.0.0.1';
const VITE_PORT_DEFAULT = 24600;
const VITE_PORT_MAX_ATTEMPTS = 8;
const VITE_PREWARM_STARTUP_BUDGET_MS = 2500;
const DEV_SHELL_RESTART_REQUEST_FILE = path.resolve('.foliole-dev-shell-restart-request.json');

process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE ??= DEV_SHELL_RESTART_REQUEST_FILE;

function run(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    ...options
  });
}

function logChildLifecycle(child, label) {
  child.on('error', (error) => {
    console.error(`[electron-dev] ${label} error`, error);
  });
  child.on('exit', (code, signal) => {
    console.info(`[electron-dev] ${label} exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });
}

function createElectronArgs(entryPath) {
  const args = [];
  if (process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION === '1') {
    args.push('--disable-gpu', '--disable-gpu-compositing', '--disable-gpu-sandbox');
  }
  if (process.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG === '1') {
    args.push('--no-sandbox');
  }
  args.push(entryPath);
  return args;
}

function resolveElectronCommand() {
  if (process.platform === 'win32') {
    return path.join('node_modules', 'electron', 'dist', 'electron.exe');
  }
  return path.join('node_modules', '.bin', 'electron');
}

function consumeDevShellRestartRequest() {
  const requestFile = process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE;
  if (!requestFile || !fs.existsSync(requestFile)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(requestFile, 'utf8');
    fs.rmSync(requestFile, { force: true });
    const parsed = JSON.parse(raw);
    if (parsed?.kind !== 'foliole-dev-shell-restart') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('[electron-dev] failed to consume dev shell restart request', error);
    return null;
  }
}

function launchElectron(viteUrl) {
  return run(resolveElectronCommand(), createElectronArgs('electron-dist/electron/main.js'), {
    env: createElectronLaunchEnv(process.env, viteUrl),
    windowsHide: false
  });
}

function runNodeScript(args, options = {}) {
  return run(process.execPath, args, options);
}

function waitForSuccessfulExit(child, label) {
  logChildLifecycle(child, label);
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${label} failed with code ${code ?? 'null'}`));
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function logPrewarmResults(prewarmResults) {
  const failedPrewarmResults = prewarmResults.filter((result) => !result.ok);
  if (failedPrewarmResults.length > 0) {
    console.warn('[electron-dev] vite renderer prewarm incomplete', failedPrewarmResults);
  } else {
    console.info('[electron-dev] vite renderer prewarm complete', prewarmResults);
  }
}

async function waitForPrewarmStartupBudget(prewarmPromise) {
  const prewarmResults = await Promise.race([
    prewarmPromise,
    wait(VITE_PREWARM_STARTUP_BUDGET_MS).then(() => null)
  ]);
  if (prewarmResults) {
    logPrewarmResults(prewarmResults);
    return;
  }
  console.warn('[electron-dev] vite renderer prewarm still running; launching Electron');
  prewarmPromise.then(logPrewarmResults).catch((error) => {
    console.warn('[electron-dev] vite renderer prewarm failed after launch', error);
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

    await waitForSuccessfulExit(
      runNodeScript(['--experimental-strip-types', 'scripts/generate-appearance-colors.ts']),
      'appearance colors generation'
    );
    const viteProc = runNodeScript([path.join('node_modules', 'vite', 'bin', 'vite.js')], {
      env: {
        ...process.env,
        FOLIOLE_VITE_PORT: String(port)
      }
    });
    logChildLifecycle(viteProc, `vite:${port}`);

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

const compile = runNodeScript([path.join('node_modules', 'typescript', 'bin', 'tsc'), '-p', 'electron/tsconfig.json']);
await waitForSuccessfulExit(compile, 'electron compile');

const viteState = await startViteWithPortFallback();
const vite = viteState.viteProc;
await waitForPrewarmStartupBudget(prewarmViteRendererEntries(viteState.viteUrl));

let electron = launchElectron(viteState.viteUrl);
logChildLifecycle(electron, 'electron');

const shutdown = () => {
  if (vite && !vite.killed) {
    vite.kill('SIGTERM');
  }
  if (!electron.killed) {
    electron.kill('SIGTERM');
  }
};

function attachElectronExitHandler(child) {
  child.on('exit', (code) => {
    const request = consumeDevShellRestartRequest();
    if (request) {
      console.info(`[electron-dev] dev shell restart requested reason=${request.reason ?? 'unknown'}`);
      electron = launchElectron(viteState.viteUrl);
      logChildLifecycle(electron, 'electron');
      attachElectronExitHandler(electron);
      return;
    }
    shutdown();
    process.exit(code ?? 0);
  });
}

attachElectronExitHandler(electron);

if (vite) {
  vite.on('exit', () => {
    shutdown();
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
