import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  printResult,
  readJson,
  readState,
  paths,
  toWindowsPath,
  wait
} from './slotCommon.mjs';

function appendWslenv(env, key, suffix = '') {
  const entry = `${key}${suffix}`;
  const existing = env.WSLENV ? env.WSLENV.split(':') : [];
  if (!existing.includes(entry)) {
    env.WSLENV = [...existing, entry].filter(Boolean).join(':');
  }
}

export function createSlotClientEnv(slot, action, extraEnv = {}) {
  const p = paths(slot);
  const windowsWorkdir = toWindowsPath(p.slotDir);
  const env = {
    ...process.env,
    ...extraEnv,
    FOLIOLE_NATIVE_LIBRARY_HOME: toWindowsPath(p.libraryDir),
    FOLIOLE_NATIVE_PREVIEW_SLOT_ROOT: toWindowsPath(p.root),
    FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY: '1',
    FOLIOLE_NATIVE_USER_DATA_PATH: toWindowsPath(p.userDataDir),
    WINDOWS_CLIENT_ACTION: action,
    WINDOWS_WORKDIR: windowsWorkdir
  };
  appendWslenv(env, 'FOLIOLE_NATIVE_LIBRARY_HOME', '/w');
  appendWslenv(env, 'FOLIOLE_NATIVE_PREVIEW_SLOT_ROOT', '/w');
  appendWslenv(env, 'FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY');
  appendWslenv(env, 'FOLIOLE_NATIVE_USER_DATA_PATH', '/w');
  appendWslenv(env, 'FOLIOLE_PREVIEW_LABEL');
  appendWslenv(env, 'FOLIOLE_VITE_PORT');
  appendWslenv(env, 'FOLIOLE_VITE_PORT_STRICT');
  if (env.FOLIOLE_VITE_PORT && !env.FOLIOLE_DEV_SCREENSHOT_PORT) {
    env.FOLIOLE_DEV_SCREENSHOT_PORT = String(38642 + Number.parseInt(env.FOLIOLE_VITE_PORT, 10) - 24600);
  }
  appendWslenv(env, 'FOLIOLE_DEV_SCREENSHOT_PORT');
  return { env, repo: p.repo };
}

export function runSlotClient(slot, action, extraEnv = {}, options = {}) {
  const { env, repo } = createSlotClientEnv(slot, action, extraEnv);
  return spawnSync('bash', ['scripts/windows/windows-restart-client.sh'], {
    cwd: repo,
    encoding: 'utf8',
    env,
    timeout: options.timeoutMs ?? Number.parseInt(process.env.FOLIOLE_PREVIEW_SLOT_CLIENT_TIMEOUT_MS || '120000', 10),
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function markerSetLooksReady(slot) {
  const p = paths(slot);
  const appReady = readJson(p.appReadyFile, null);
  const bridgeReady = readJson(p.bridgeReadyFile, null);
  const windowVisible = readJson(p.windowVisibleFile, null);
  const state = readJson(p.clientStateFile, null);
  const sameSession = Boolean(appReady?.session) &&
    appReady.session === bridgeReady?.session &&
    appReady.session === windowVisible?.session;
  const expectedHead = state?.head || readState(slot).baselineHead || '';
  const headMatches = !expectedHead || appReady?.head === expectedHead;
  const ready = sameSession &&
    headMatches &&
    appReady?.stage === 'app_ready' &&
    bridgeReady?.stage === 'bridge_ready' &&
    bridgeReady?.payload?.bridgeAvailable === true &&
    windowVisible?.stage === 'window_visible' &&
    windowVisible?.payload?.isVisible === true;
  return { appReady, bridgeReady, expectedHead, ready, state, windowVisible };
}

export function readSlotReady(slot) {
  const markers = markerSetLooksReady(slot);
  if (!markers.ready) return { ...markers, running: false };
  const result = runSlotClient(slot, 'status', {}, { timeoutMs: 20000 });
  const running = result.status === 0 && /\[windows-restart-client\]\s+status:\s+RUNNING\b/u.test(result.stdout);
  return { ...markers, running };
}

export function slotStatus(slot, { print = true } = {}) {
  const ready = readSlotReady(slot);
  if (print) {
    if (ready.running) {
      console.log(`[preview-slot] status: RUNNING trust=OK runtime_pid=${ready.windowVisible?.pid ?? 'unknown'} head=${ready.appReady?.head ?? 'unknown'}`);
    } else {
      console.log('[preview-slot] status: STOPPED trust=FAILED reason=no-ready-markers');
    }
  }
  return { ready, running: ready.running };
}

export async function runSlotClientUntilReady(slot, action, extraEnv = {}) {
  const { env, repo } = createSlotClientEnv(slot, action, extraEnv);
  const child = spawn('bash', ['scripts/windows/windows-restart-client.sh'], {
    cwd: repo,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  let exitSignal = null;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });
  child.on('exit', (code, signal) => {
    exitCode = code;
    exitSignal = signal;
  });
  await waitForReady({ action, child, exitCodeRef: () => exitCode, exitSignalRef: () => exitSignal, slot, stderrRef: () => stderr, stdoutRef: () => stdout });
}

async function waitForReady({ action, child, exitCodeRef, exitSignalRef, slot, stderrRef, stdoutRef }) {
  const deadline = Date.now() + Number.parseInt(process.env.FOLIOLE_PREVIEW_SLOT_READY_TIMEOUT_MS || '120000', 10);
  while (Date.now() < deadline) {
    if (slotStatus(slot, { print: false }).running) {
      await releaseChild(child);
      console.log(`[preview-slot] client ${action} ready signal received slot=${slot}`);
      return;
    }
    if (exitCodeRef() !== null) {
      if (exitCodeRef() === 0) return;
      throw new Error(`slot client ${action} failed code=${exitCodeRef()} signal=${exitSignalRef() ?? 'none'}${stderrRef() ? `\n${stderrRef().trim()}` : ''}`);
    }
    await wait(1000);
  }
  await releaseChild(child);
  throw new Error(`slot client ${action} timed out waiting for ready signal${stdoutRef() || stderrRef() ? `\n${stdoutRef()}${stderrRef()}` : ''}`);
}

async function releaseChild(child) {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await wait(500);
  }
  child.stdout.destroy();
  child.stderr.destroy();
  child.unref();
}

export function compileElectronInSlot(slot) {
  const p = paths(slot);
  const windowsWorkdir = toWindowsPath(p.slotDir);
  console.log(`[preview-slot] compiling electron runtime inside slot=${slot}`);
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-WindowStyle',
    'Hidden',
    '-NonInteractive',
    '-Command',
    `$ErrorActionPreference='Stop'; Set-Location -LiteralPath '${windowsWorkdir}'; npm.cmd run electron:compile`
  ], {
    cwd: p.repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  printResult(result);
  if (result.status !== 0) {
    throw new Error(`slot electron compile failed code=${result.status ?? 'unknown'}`);
  }
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return false;
  fs.rmSync(target, { force: true, recursive: true });
  fs.cpSync(source, target, { recursive: true });
  return true;
}

export function ensureElectronDistInSlot(slot, { requiresRuntimeRestart = false } = {}) {
  const p = paths(slot);
  const slotMain = path.join(p.slotDir, 'electron-dist', 'electron', 'main.js');
  if (fs.existsSync(slotMain) && !requiresRuntimeRestart) return 'present';
  if (requiresRuntimeRestart) {
    compileElectronInSlot(slot);
    return 'compiled';
  }

  const mirrorDist = path.join(p.mainMirrorDir, 'electron-dist');
  const slotDist = path.join(p.slotDir, 'electron-dist');
  if (copyDirectory(mirrorDist, slotDist) && fs.existsSync(slotMain)) {
    console.log(`[preview-slot] copied electron-dist from main mirror slot=${slot}`);
    return 'copied';
  }

  compileElectronInSlot(slot);
  return 'compiled';
}
