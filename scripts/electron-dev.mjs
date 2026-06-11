/* global AbortController, console */

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import { createElectronLaunchEnv } from './electron-dev-env.mjs';
import {
  isViteServerReady,
  prewarmViteRendererEntries,
  waitForPrewarmStartupBudget
} from './electron-dev-server.mjs';
import {
  candidateVitePorts,
  isStrictVitePort,
  resolveRequestedPort,
  resolveViteUrl
} from './electron-dev-vite-port.mjs';

const VITE_PREWARM_STARTUP_BUDGET_MS = 8000;
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
  args.push(...process.argv.slice(2));
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
    if (typeof parsed.runtimeHead === 'string' && parsed.runtimeHead.trim().length > 0) {
      process.env.FOLIOLE_RUNTIME_HEAD = parsed.runtimeHead.trim();
    }
    if (typeof parsed.bootSession === 'string' && parsed.bootSession.trim().length > 0) {
      process.env.FOLIOLE_BOOT_SESSION = parsed.bootSession.trim();
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

function resolveVitePrewarmStartupBudgetMs() {
  const raw = process.env.FOLIOLE_VITE_PREWARM_STARTUP_BUDGET_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return VITE_PREWARM_STARTUP_BUDGET_MS;
}

async function startViteWithPortFallback() {
  const preferredPort = resolveRequestedPort();
  const strictPort = isStrictVitePort();

  for (const port of candidateVitePorts(preferredPort)) {
    const viteUrl = resolveViteUrl(port);
    if (await isViteServerReady(viteUrl)) {
      if (strictPort) {
        throw new Error(`strict Vite port already has a ready server: ${viteUrl}`);
      }
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

  throw new Error(strictPort ? `vite dev server did not become ready on strict port ${preferredPort}` : 'vite dev server did not become ready');
}

const compile = runNodeScript([path.join('node_modules', 'typescript', 'bin', 'tsc'), '-p', 'electron/tsconfig.json']);
await waitForSuccessfulExit(compile, 'electron compile');

const viteState = await startViteWithPortFallback();
const vite = viteState.viteProc;
const prewarmAbortController = new AbortController();
const prewarmStatus = await waitForPrewarmStartupBudget(
  prewarmViteRendererEntries(viteState.viteUrl, globalThis.fetch, { signal: prewarmAbortController.signal }),
  {
    abortController: prewarmAbortController,
    budgetMs: resolveVitePrewarmStartupBudgetMs()
  }
);
console.info(
  `[electron-dev] startup timing electron_launch prewarmStatus=${prewarmStatus.status} prewarmElapsedMs=${prewarmStatus.elapsedMs}`
);

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
      if (request.shellAction === 'exit-shell') {
        shutdown();
        process.exit(code ?? 0);
      }
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
