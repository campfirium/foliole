/* global URL, console, process, setTimeout */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isViteServerReady } from '../electron-dev-server.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const VITE_HOST = '127.0.0.1';
const VITE_PORT_DEFAULT = 24600;
const VITE_PORT_MAX_ATTEMPTS = 8;
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

function resolveRequestedPort() {
  const parsed = Number.parseInt(process.env.FOLIOLE_VITE_PORT ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : VITE_PORT_DEFAULT;
}

function resolveViteUrl(port) {
  return `http://${VITE_HOST}:${port}`;
}

function candidateVitePorts() {
  const preferredPort = resolveRequestedPort();
  const ports = new Set([preferredPort]);
  for (let offset = 0; offset < VITE_PORT_MAX_ATTEMPTS; offset += 1) {
    ports.add(preferredPort + 100 + offset);
    ports.add(5173 + offset);
    ports.add(3000 + offset);
  }
  return [...ports];
}

async function runChecked(command, args, label, options = {}) {
  console.log(`[electron-native-health] ${label}`);
  const child = run(command, args, { shell: options.shell, stdio: 'inherit' });
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
  for (const port of candidateVitePorts()) {
    const viteUrl = resolveViteUrl(port);
    if (await isViteServerReady(viteUrl)) {
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
  throw new Error('vite dev server did not become ready');
}

function stopChild(child) {
  if (child && !child.killed && child.exitCode === null) {
    child.kill('SIGTERM');
  }
}

function markerPath(name) {
  return path.join(repoRoot, name);
}

function resetMarkers() {
  for (const name of ['.windows-native-boot-ready.json', '.windows-native-bridge-ready.json']) {
    fs.rmSync(markerPath(name), { force: true });
  }
}

function readMarker(name) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(name), 'utf8'));
  } catch {
    return null;
  }
}

export function markerMatches(marker, expectedStage, expectedSession, expectedPid) {
  return Boolean(
    marker &&
    marker.stage === expectedStage &&
    marker.session === expectedSession &&
    marker.pid === expectedPid
  );
}

export function readyMarkersMatch(appReady, bridgeReady, expectedSession) {
  return Boolean(
    appReady &&
    bridgeReady &&
    appReady.stage === 'app_ready' &&
    bridgeReady.stage === 'bridge_ready' &&
    appReady.session === expectedSession &&
    bridgeReady.session === expectedSession &&
    appReady.pid === bridgeReady.pid
  );
}

function appendOutputTail(tail, chunk) {
  tail.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
  if (tail.length > OUTPUT_TAIL_LIMIT) {
    tail.splice(0, tail.length - OUTPUT_TAIL_LIMIT);
  }
}

async function waitForReadyMarkers(input) {
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const appReady = readMarker('.windows-native-boot-ready.json');
    const bridgeReady = readMarker('.windows-native-bridge-ready.json');
    if (readyMarkersMatch(appReady, bridgeReady, input.session)) {
      return { appReady, bridgeReady };
    }
    if (input.electron.exitCode !== null) {
      throw new Error(`electron exited before ready markers code=${input.electron.exitCode}`);
    }
    await wait(500);
  }
  throw new Error(`ready markers timed out pid=${input.pid} session=${input.session}`);
}

async function main() {
  const compile = npmRunCommand('electron:compile');
  await runChecked(compile.command, compile.args, 'compile electron', { shell: compile.shell });
  const rebuild = npmRunCommand('electron:rebuild:native');
  await runChecked(rebuild.command, rebuild.args, 'restore electron native ABI', { shell: rebuild.shell });
  const vite = await startVite();
  const session = `windows-native-health-${Date.now()}`;
  const electronPath = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const userDataPath = path.join(repoRoot, '.electron-user-data');
  const env = {
    ...process.env,
    ELECTRON_RENDERER_URL: vite.viteUrl,
    FOLIOLE_BOOT_SESSION: session,
    FOLIOLE_SESSION_DATA_PATH: userDataPath,
    FOLIOLE_USER_DATA_PATH: userDataPath,
    FOLIOLE_WORKDIR: repoRoot
  };
  delete env.ELECTRON_RUN_AS_NODE;
  resetMarkers();
  const electron = run(electronPath, ['electron-dist/electron/main.js'], {
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  const outputTail = [];
  electron.stdout.on('data', (chunk) => appendOutputTail(outputTail, chunk));
  electron.stderr.on('data', (chunk) => appendOutputTail(outputTail, chunk));
  try {
    const markers = await waitForReadyMarkers({ electron, pid: electron.pid, session });
    console.log(
      `[electron-native-health] status: READY runtime_pid=${markers.appReady.pid} session=${session} renderer=${vite.viteUrl} bridge=${markers.bridgeReady.payload?.bridgeAvailable === true ? 'OK' : 'UNKNOWN'}`
    );
    if (markers.appReady.pid !== electron.pid) {
      console.log(`[electron-native-health] runtime marker pid=${markers.appReady.pid} launch_pid=${electron.pid}`);
    }
  } catch (error) {
    console.error(`[electron-native-health] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    if (outputTail.length > 0) {
      console.error(`[electron-native-health] output tail:\n${outputTail.join('\n')}`);
    }
    process.exitCode = 1;
  } finally {
    const appReady = readMarker('.windows-native-boot-ready.json');
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
