/* global URL, console, process, setTimeout */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isViteServerReady } from '../electron-dev-server.mjs';
import {
  candidateVitePorts,
  isStrictVitePort,
  resolveRequestedPort,
  resolveViteUrl
} from '../electron-dev-vite-port.mjs';
import {
  readMarker,
  resetReadyMarkers,
  verifyRendererReload,
  waitForReadyMarkers
} from './electron-native-health-check-support.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const nativePaths = resolveWindowsNativePaths(repoRoot);
const CHECK_TIMEOUT_MS = Number.parseInt(process.env.FOLIOLE_NATIVE_HEALTH_TIMEOUT_MS ?? '60000', 10);
const OUTPUT_TAIL_LIMIT = 120;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: repoRoot,
    shell: options.shell ?? false,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    ...options
  });
}

function npmRunCommand(scriptName) {
  if (process.env.npm_execpath) {
    return {
      args: [process.env.npm_execpath, 'run', scriptName],
      command: process.execPath,
      shell: false
    };
  }
  return {
    args: ['run', scriptName],
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    shell: process.platform === 'win32'
  };
}

export function resolveElectronExecutablePath(appRoot = repoRoot, platform = process.platform) {
  const executable = platform === 'win32' ? 'electron.exe' : 'electron';
  return path.join(appRoot, 'node_modules', 'electron', 'dist', executable);
}

export function canRunGuiHealth(env = process.env, platform = process.platform) {
  return platform === 'win32' || Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}

async function runChecked(command, args, label, options = {}) {
  console.log(`[electron-native-health] ${label}`);
  const child = run(command, args, { env: options.env, shell: options.shell, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${label} failed with code ${code ?? 'null'}`));
    });
  });
}

async function startVite() {
  const strictPort = isStrictVitePort();
  for (const port of candidateVitePorts(resolveRequestedPort())) {
    const viteUrl = resolveViteUrl(port);
    if (await isViteServerReady(viteUrl)) {
      if (strictPort) {
        throw new Error(`strict Vite port already has a ready server: ${viteUrl}`);
      }
      return { owned: false, proc: null, viteUrl };
    }
    const proc = run(process.execPath, ['node_modules/vite/bin/vite.js'], {
      env: {
        ...process.env,
        FOLIOLE_VITE_PORT: String(port)
      },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (await isViteServerReady(viteUrl)) {
        return { owned: true, proc, viteUrl };
      }
      if (proc.exitCode !== null) {
        break;
      }
      await wait(500);
    }
    stopChild(proc);
  }
  throw new Error(strictPort ? `vite dev server did not become ready on strict port ${resolveRequestedPort()}` : 'vite dev server did not become ready');
}

function stopChild(child) {
  if (child && !child.killed && child.exitCode === null) {
    child.kill('SIGTERM');
  }
}

function appendOutputTail(tail, chunk) {
  tail.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
  if (tail.length > OUTPUT_TAIL_LIMIT) {
    tail.splice(0, tail.length - OUTPUT_TAIL_LIMIT);
  }
}

async function main() {
  const compile = npmRunCommand('electron:compile');
  await runChecked(compile.command, compile.args, 'compile electron', { shell: compile.shell });
  const rebuild = npmRunCommand('electron:rebuild:native');
  await runChecked(rebuild.command, rebuild.args, 'restore electron native ABI', { shell: rebuild.shell });
  await runChecked(resolveElectronExecutablePath(), ['scripts/desktop/desktop-dnssd-native-probe.cjs'],
    'verify desktop DNS-SD native lifecycle', { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  await runChecked(process.execPath, ['scripts/electron-sqlite-runner.mjs', '--preflight'], 'verify electron sqlite ABI');
  if (!canRunGuiHealth()) {
    console.log('[electron-native-health] status: ABI_READY gui=SKIPPED reason=headless-non-windows-host');
    return;
  }
  const vite = await startVite();
  const session = `windows-native-health-${Date.now()}`;
  const electronPath = resolveElectronExecutablePath(repoRoot);
  const userDataPath = nativePaths.userDataPath;
  const env = {
    ...process.env,
    ELECTRON_RENDERER_URL: vite.viteUrl,
    FOLIOLE_BOOT_SESSION: session,
    FOLIOLE_SESSION_DATA_PATH: userDataPath,
    FOLIOLE_USER_DATA_PATH: userDataPath,
    FOLIOLE_WORKDIR: repoRoot
  };
  delete env.ELECTRON_RUN_AS_NODE;
  resetReadyMarkers(repoRoot);
  const electron = run(electronPath, ['dist/electron/main.js'], {
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  const outputTail = [];
  electron.stdout.on('data', (chunk) => appendOutputTail(outputTail, chunk));
  electron.stderr.on('data', (chunk) => appendOutputTail(outputTail, chunk));
  try {
    const markers = await waitForReadyMarkers({
      electron,
      pid: electron.pid,
      repoRoot,
      session,
      timeoutMs: CHECK_TIMEOUT_MS
    });
    console.log(
      `[electron-native-health] status: READY runtime_pid=${markers.appReady.pid} session=${session} renderer=${vite.viteUrl} bridge=${markers.bridgeReady.payload?.bridgeAvailable === true ? 'OK' : 'UNKNOWN'}`
    );
    if (markers.appReady.pid !== electron.pid) {
      console.log(`[electron-native-health] runtime marker pid=${markers.appReady.pid} launch_pid=${electron.pid}`);
    }
    const reloadNonce = await verifyRendererReload({ repoRoot, timeoutMs: CHECK_TIMEOUT_MS });
    console.log(`[electron-native-health] renderer reload: DELIVERED nonce=${reloadNonce}`);
  } catch (error) {
    console.error(`[electron-native-health] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    if (outputTail.length > 0) {
      console.error(`[electron-native-health] output tail:\n${outputTail.join('\n')}`);
    }
    process.exitCode = 1;
  } finally {
    const appReady = readMarker(repoRoot, '.windows-native-boot-ready.json');
    if (appReady?.pid && appReady.pid !== electron.pid) {
      try {
        process.kill(appReady.pid);
      } catch {
        // The runtime may have exited during shutdown.
      }
    }
    stopChild(electron);
    if (vite.owned) {
      stopChild(vite.proc);
    }
    await wait(500);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
