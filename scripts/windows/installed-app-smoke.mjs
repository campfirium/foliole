/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';
import {
  readMarker,
  readyMarkersMatch,
  resetReadyMarkers,
} from './electron-native-health-check-support.mjs';

const DEFAULT_TIMEOUT_MS = 300_000;
const OUTPUT_TAIL_LIMIT = 120;
const PROCESS_EXIT_WAIT_MS = 5_000;

function resolveTimeoutMs(env = process.env) {
  const parsed = Number.parseInt(
    env.FOLIOLE_INSTALLED_APP_SMOKE_TIMEOUT_MS ??
      env.FOLIOLE_ELECTRON_PLAYWRIGHT_TIMEOUT_MS ??
      '',
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function resolveInstalledAppSmokeEnv(env = process.env) {
  return {
    ...env,
    FOLIOLE_ELECTRON_LAUNCH_MODE: 'installed',
    FOLIOLE_ELECTRON_PLAYWRIGHT_ALLOW_STALE_RENDERER: '1',
    FOLIOLE_DISABLE_HARDWARE_ACCELERATION: env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION?.trim() || '1',
    FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE: env.FOLIOLE_ENABLE_DESKTOP_DEBUG_PROBE?.trim() || '1'
  };
}

export function resolveInstalledAppExePath(env = process.env, exists = existsSync) {
  const configuredPath = env.FOLIOLE_ELECTRON_INSTALLED_EXE_PATH?.trim();
  const localAppDataPath = env.LOCALAPPDATA?.trim()
    ? path.win32.join(env.LOCALAPPDATA, 'Programs', 'Foliole', 'Foliole.exe')
    : null;
  const candidatePath = configuredPath || localAppDataPath;
  if (!candidatePath) {
    throw new Error('Set FOLIOLE_ELECTRON_INSTALLED_EXE_PATH or LOCALAPPDATA before installed app smoke.');
  }
  const resolvedPath = path.win32.resolve(candidatePath);
  if (!exists(resolvedPath)) {
    throw new Error(`Installed Foliole executable was not found: ${resolvedPath}`);
  }
  return resolvedPath;
}

function appendOutputTail(tail, chunk) {
  tail.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
  if (tail.length > OUTPUT_TAIL_LIMIT) {
    tail.splice(0, tail.length - OUTPUT_TAIL_LIMIT);
  }
}

function launchInstalledApp(executablePath, env) {
  const child = spawn(executablePath, [], {
    cwd: path.win32.dirname(executablePath),
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false
  });
  const outputTail = [];
  child.stdout?.on('data', (chunk) => appendOutputTail(outputTail, chunk));
  child.stderr?.on('data', (chunk) => appendOutputTail(outputTail, chunk));
  return { child, outputTail };
}

function stopProcess(pid) {
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {
    // The app may already have exited after the smoke assertion.
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForProcessExit(child, timeoutMs = PROCESS_EXIT_WAIT_MS) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(timeoutMs)
  ]);
}

async function cleanupIsolation(isolation) {
  try {
    isolation.cleanup();
  } catch (error) {
    console.warn(
      `[installed-app-smoke] cleanup skipped path=${isolation.runtimeStateRoot} ` +
        `reason=${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function waitForInstalledReadyMarkers(input) {
  const deadline = Date.now() + input.timeoutMs;
  const markerReader = input.readMarker ?? readMarker;
  while (Date.now() < deadline) {
    const appReady = markerReader(input.repoRoot, '.windows-native-boot-ready.json');
    const bridgeReady = markerReader(input.repoRoot, '.windows-native-bridge-ready.json');
    if (readyMarkersMatch(appReady, bridgeReady, input.session)) {
      return { appReady, bridgeReady };
    }
    await wait(500);
  }
  throw new Error(
    `installed app ready markers timed out launcher_pid=${input.pid} ` +
      `launcher_exit=${input.electron.exitCode ?? 'running'} session=${input.session}`
  );
}

export async function runInstalledAppSmoke({
  createIsolation = createDesktopIsolationContext,
  env = process.env,
  exists = existsSync,
  launchApp = launchInstalledApp,
  now = Date.now,
  resetMarkers = resetReadyMarkers,
  stopRuntime = stopProcess,
  waitForMarkers = waitForInstalledReadyMarkers
} = {}) {
  const executablePath = resolveInstalledAppExePath(env, exists);
  const isolation = createIsolation(env);
  const session = `installed-app-smoke-${now()}`;
  const smokeEnv = resolveInstalledAppSmokeEnv({
    ...env,
    ...isolation.env,
    FOLIOLE_BOOT_SESSION: session,
    FOLIOLE_ELECTRON_INSTALLED_EXE_PATH: executablePath
  });
  delete smokeEnv.ELECTRON_RUN_AS_NODE;

  resetMarkers(isolation.runtimeStateRoot);
  const { child, outputTail } = launchApp(executablePath, smokeEnv);
  let markers;
  try {
    markers = await waitForMarkers({
      electron: child,
      pid: child.pid,
      repoRoot: isolation.runtimeStateRoot,
      session,
      timeoutMs: resolveTimeoutMs(env)
    });
    if (markers.bridgeReady.payload?.bridgeAvailable !== true) {
      throw new Error(`installed app bridge_ready marker did not confirm bridge availability: ${JSON.stringify(markers.bridgeReady)}`);
    }
    return {
      appReady: markers.appReady,
      bridgeReady: markers.bridgeReady,
      executablePath,
      launchMode: 'installed',
      outputTail,
      runtimePid: markers.appReady.pid,
      session
    };
  } catch (error) {
    if (outputTail.length > 0 && error instanceof Error) {
      error.message = `${error.message}\n[installed-app-smoke] output tail:\n${outputTail.join('\n')}`;
    }
    throw error;
  } finally {
    stopRuntime(child.pid);
    stopRuntime(markers?.appReady?.pid);
    await waitForProcessExit(child);
    await cleanupIsolation(isolation);
  }
}

if (process.argv[1] && process.argv[1].endsWith('installed-app-smoke.mjs')) {
  const result = await runInstalledAppSmoke();
  console.log(
    `[installed-app-smoke] ok mode=${result.launchMode} pid=${result.runtimePid} session=${result.session} exe=${result.executablePath}`
  );
}
