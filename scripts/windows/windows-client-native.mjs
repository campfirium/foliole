/* global console, process, setTimeout */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeClientLogStreams, createClientLogStreams, printStartupLogTail } from './windows-client-native-logs.mjs';
import { forceRestartClient } from './windows-client-native-force-restart.mjs';
import { runCapture } from './windows-client-native-process.mjs';
import { recoverClientStateFromReady } from './windows-client-native-recovered-state.mjs';
import { removeShellRestartRequest } from './windows-client-native-shell-request.mjs';
import { stopNativeClient } from './windows-client-native-stop.mjs';
import {
  readClientState as readClientStateFile,
  readReadyStateFromBootEvents,
  readReadyState as readReadyStateFiles,
  removeClientState,
  resetReadyMarkers,
  saveClientState
} from './windows-client-native-state.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

export const WINDOWS_CLIENT_ACTIONS = new Set(['status', 'start', 'stop', 'restart', 'full-restart']);

const {
  appReadyFile,
  bootEventLogFile,
  bridgeReadyFile,
  logDir,
  nativeStartScript,
  repoRoot,
  restartDeliveryFile,
  shellRestartRequestFile,
  stateFile,
  windowVisibleFile
} = resolveWindowsNativePaths();
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
  const state = readClientState();
  return readReadyStateFiles({ appReadyFile, bridgeReadyFile, windowVisibleFile }) ??
    readReadyStateFromBootEvents(bootEventLogFile, { session: state?.session });
}

async function currentHead() {
  const result = await runCapture('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return result.code === 0 ? result.stdout.trim() : '';
}

async function startNativeDevRunner({ head, logs, session }) {
  const result = await runCapture('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    nativeStartScript,
    '-NodePath',
    process.execPath,
    '-WorkDir',
    repoRoot,
    '-Session',
    session,
    '-RuntimeHead',
    head,
    '-StdoutLog',
    logs.stdoutLog,
    '-StderrLog',
    logs.stderrLog
  ], { cwd: repoRoot, timeoutMs: 30000 });
  const shellPid = Number.parseInt(result.stdout.match(/shell_pid=(\d+)/u)?.[1] ?? '', 10);
  if (result.code !== 0 || !Number.isInteger(shellPid)) {
    const reason = result.stderr.trim() || result.stdout.trim() || result.error?.message || 'missing shell_pid';
    throw new Error(`native dev runner start failed: ${reason}`);
  }
  return shellPid;
}

function printStatus() {
  const state = readClientState();
  const ready = readReadyState();
  if (ready) {
    const runtimeHead = ready.appReady.head ?? state?.head;
    const head = runtimeHead ? ` head=${runtimeHead}` : '';
    console.log(`[windows-restart-client] status: RUNNING trust=OK shell_pid=${state?.shellPid ?? 'unknown'} runtime_pid=${ready.windowVisible.pid}${head}`);
    return { ok: true, ready, state };
  }
  console.log('[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime');
  return { ok: false, ready: null, state };
}

async function resetMarkers() {
  await resetReadyMarkers({ appReadyFile, bridgeReadyFile, windowVisibleFile });
}

const saveState = (state) => saveClientState(stateFile, state);

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
  const head = await currentHead();
  const existing = printStatus();
  if (existing.ok) {
    if (existing.ready.appReady.head === head) {
      return { alreadyRunning: true, ready: existing.ready, state: existing.state };
    }
    await stopClient({ print: false });
  }
  await resetMarkers();
  await removeShellRestartRequest(shellRestartRequestFile);
  const session = `windows-native-client-${Date.now()}`;
  const logs = await createClientLogStreams(logDir, session);
  closeClientLogStreams(logs);
  const shellPid = await startNativeDevRunner({ head, logs, session });
  await saveState({
    head,
    session,
    shellPid,
    startedAt: new Date().toISOString(),
    stderrLog: logs.stderrLog,
    stdoutLog: logs.stdoutLog
  });
  const ready = await waitForReady(session);
  if (!ready) {
    printStartupLogTail(readClientState());
    await removeClientState(stateFile);
    await resetMarkers();
    throw new Error(`startup health check failed: app-ready-timeout shell_pid=${shellPid} left-for-inspection`);
  }
  await saveState({
    head,
    runtimePid: ready.windowVisible.pid,
    session,
    shellPid,
    startedAt: new Date().toISOString(),
    stderrLog: logs.stderrLog,
    stdoutLog: logs.stdoutLog
  });
  if (print) {
    console.log(`[windows-restart-client] status: STARTED shell_pid=${shellPid} runtime_pid=${ready.windowVisible.pid}`);
  }
  return { alreadyRunning: false, ready, state: readClientState() };
}

async function stopClient({ print = true } = {}) {
  await stopNativeClient({
    print,
    readClientState,
    readReadyState,
    removeClientState: () => removeClientState(stateFile),
    resetMarkers
  });
}

async function restartRuntimeClient() {
  const existing = printStatus();
  if (!existing.ok) {
    const started = await startClient({ print: false });
    console.log(`[windows-restart-client] status: STARTED shell_pid=${started.state.shellPid} runtime_pid=${started.ready.windowVisible.pid}`);
    return;
  }

  await forceRestartClient({
    currentHead,
    mode: 'dev-shell-restart',
    readClientState,
    readReadyState,
    recoverClientStateFromReady,
    removeClientState: () => removeClientState(stateFile),
    resetMarkers,
    saveState,
    startClient,
    stopClient,
    wait
  });
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
  } else if (action === 'restart') {
    await restartRuntimeClient();
  } else if (action === 'full-restart') {
    await forceRestartClient({
      currentHead,
      mode: 'full-shell-restart',
      readClientState,
      readReadyState,
      recoverClientStateFromReady,
      removeClientState: () => removeClientState(stateFile),
      repoRoot,
      resetMarkers,
      restartDeliveryFile,
      saveState,
      startClient,
      stopClient,
      wait
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[windows-restart-client] status: ${process.argv[2] === 'start' ? 'START_FAILED' : 'RESTART_FAILED'} reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
