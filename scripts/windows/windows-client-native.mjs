/* global URL, console, process, setTimeout */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeClientLogStreams, createClientLogStreams, printStartupLogTail } from './windows-client-native-logs.mjs';
import {
  processAlive,
  readClientState as readClientStateFile,
  readReadyState as readReadyStateFiles,
  removeClientState,
  resetReadyMarkers,
  saveClientState
} from './windows-client-native-state.mjs';

export const WINDOWS_CLIENT_ACTIONS = new Set(['status', 'start', 'stop', 'restart', 'full-restart']);

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const stateFile = path.join(repoRoot, '.windows-native-client-state.json');
const appReadyFile = path.join(repoRoot, '.windows-native-boot-ready.json');
const bridgeReadyFile = path.join(repoRoot, '.windows-native-bridge-ready.json');
const logDir = path.join(repoRoot, '.tmp', 'windows-native-client');
const healthTimeoutMs = Number.parseInt(process.env.FOLIOLE_ELECTRON_HEALTHCHECK_MS ?? '90000', 10);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readClientState() {
  return readClientStateFile(stateFile);
}

function readReadyState() {
  return readReadyStateFiles({ appReadyFile, bridgeReadyFile });
}

async function currentHead() {
  const result = await runCapture('git', ['rev-parse', 'HEAD']);
  return result.code === 0 ? result.stdout.trim() : '';
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      resolve({ code: 1, error, stderr, stdout });
    });
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, error: null, stderr, stdout });
    });
  });
}

function printStatus() {
  const state = readClientState();
  const ready = readReadyState();
  if (ready) {
    const head = state?.head ? ` head=${state.head}` : '';
    console.log(`[windows-restart-client] status: RUNNING trust=OK shell_pid=${state?.shellPid ?? 'unknown'} runtime_pid=${ready.appReady.pid}${head}`);
    return { ok: true, ready, state };
  }
  console.log('[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime');
  return { ok: false, ready: null, state };
}

async function resetMarkers() {
  await resetReadyMarkers({ appReadyFile, bridgeReadyFile });
}

async function saveState(state) {
  await saveClientState(stateFile, state);
}

async function waitForReady(session) {
  const deadline = Date.now() + healthTimeoutMs;
  while (Date.now() < deadline) {
    const ready = readReadyState();
    if (ready?.appReady.session === session) {
      return ready;
    }
    await wait(500);
  }
  return null;
}

async function startClient({ print = true } = {}) {
  const existing = printStatus();
  if (existing.ok) {
    return { alreadyRunning: true, ready: existing.ready, state: existing.state };
  }

  await resetMarkers();
  const session = `windows-native-client-${Date.now()}`;
  const head = await currentHead();
  const logs = await createClientLogStreams(logDir, session);
  const child = spawn(process.execPath, ['scripts/windows/electron-dev-native.mjs'], {
    cwd: repoRoot,
    detached: true,
    env: {
      ...process.env,
      FOLIOLE_BOOT_SESSION: session,
      FOLIOLE_RUNTIME_HEAD: head
    },
    shell: false,
    stdio: ['ignore', logs.stdoutFd, logs.stderrFd],
    windowsHide: true
  });
  child.unref();
  await saveState({
    head,
    session,
    shellPid: child.pid,
    startedAt: new Date().toISOString(),
    stderrLog: logs.stderrLog,
    stdoutLog: logs.stdoutLog
  });
  const ready = await waitForReady(session);
  if (!ready) {
    await killPid(child.pid);
    closeClientLogStreams(logs);
    printStartupLogTail(readClientState());
    await removeClientState(stateFile);
    await resetMarkers();
    throw new Error('startup health check failed: app-ready-timeout');
  }
  closeClientLogStreams(logs);
  await saveState({
    head,
    runtimePid: ready.appReady.pid,
    session,
    shellPid: child.pid,
    startedAt: new Date().toISOString(),
    stderrLog: logs.stderrLog,
    stdoutLog: logs.stdoutLog
  });
  if (print) {
    console.log(`[windows-restart-client] status: STARTED shell_pid=${child.pid} runtime_pid=${ready.appReady.pid}`);
  }
  return { alreadyRunning: false, ready, state: readClientState() };
}

async function killPid(pid) {
  if (!processAlive(pid)) {
    return;
  }
  const result = await runCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
  if (result.code !== 0 && processAlive(pid)) {
    const detail = `${result.stdout}${result.stderr}`.split(/\r?\n/u).filter(Boolean).slice(-8).join(' ');
    throw new Error(`taskkill failed pid=${pid}${detail ? ` ${detail}` : ''}`);
  }
}

async function stopClient({ print = true } = {}) {
  const state = readClientState();
  const ready = readReadyState();
  await killPid(state?.shellPid);
  await killPid(state?.runtimePid ?? ready?.appReady.pid);
  await removeClientState(stateFile);
  await resetMarkers();
  if (print) {
    console.log('[windows-restart-client] status: STOPPED');
  }
}

async function restartClient(mode) {
  await stopClient({ print: false });
  const started = await startClient({ print: false });
  console.log(`[windows-restart-client] status: RESTARTED mode=${mode} shell_pid=${started.state.shellPid} runtime_pid=${started.ready.appReady.pid}`);
}

export function resolveWindowsClientAction(argv) {
  const action = argv[2] ?? process.env.WINDOWS_CLIENT_ACTION ?? 'status';
  if (!WINDOWS_CLIENT_ACTIONS.has(action)) {
    throw new Error(`unsupported Windows client action: ${action}`);
  }
  return action;
}

async function main() {
  const action = resolveWindowsClientAction(process.argv);
  console.log(`[windows-client-native] action=${action}`);
  console.log(`[windows-client-native] workdir=${repoRoot}`);
  if (action === 'status') {
    printStatus();
  } else if (action === 'start') {
    await startClient();
  } else if (action === 'stop') {
    await stopClient();
  } else if (action === 'restart' || action === 'full-restart') {
    await restartClient(action === 'restart' ? 'runtime-only' : 'full-shell-restart');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[windows-restart-client] status: ${process.argv[2] === 'start' ? 'START_FAILED' : 'RESTART_FAILED'} reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
