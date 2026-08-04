/* global console, process */
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { closeClientLogStreams, createClientLogStreams, printStartupLogTail } from './windows-client-native-logs.mjs';
import { forceRestartClient } from './windows-client-native-force-restart.mjs';
import { resolveWindowsClientHead } from './windows-client-native-head.mjs';
import { runCapture } from './windows-client-native-process.mjs';
import { recoverClientStateFromReady, recoverClientStateFromStatus } from './windows-client-native-recovered-state.mjs';
import { restartRuntimeClient } from './windows-client-native-runtime-restart.mjs';
import { removeShellRestartRequest } from './windows-client-native-shell-request.mjs';
import { startNativeDevRunner } from './windows-client-native-start-runner.mjs';
import { createStatusPrinter } from './windows-client-native-status.mjs';
import { listRepoElectronPids, stopNativeClient } from './windows-client-native-stop.mjs';
import { readNativeWindowHealth } from './windows-client-native-window-health.mjs';
import { resolveWindowsClientAction } from './windows-client-native-actions.mjs';
import { dispatchWindowsNativeClientAction } from './windows-client-native-interactive.mjs';
import { createWindowsClientStateReaders } from './windows-client-native-state-readers.mjs';
import * as nativeState from './windows-client-native-state.mjs';
import { formatStartupHealthFailure, readStartupFailureFromBootEvents } from './windows-client-native-startup-failure.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const {
  appReadyFile,
  bootEventLogFile,
  bridgeReadyFile,
  logDir,
  nativeStartScript,
  nativeTaskInstallScript,
  nativeTaskStateRoot,
  nativeTaskWorkerScript,
  nativeWindowHealthScript,
  repoRoot,
  restartDeliveryFile,
  shellRestartRequestFile,
  stateFile,
  windowVisibleFile
} = resolveWindowsNativePaths();
const healthTimeoutMs = Number.parseInt(process.env.FOLIOLE_ELECTRON_HEALTHCHECK_MS ?? '60000', 10);

const { readClientState, readReadyState } = createWindowsClientStateReaders({
  appReadyFile, bootEventLogFile, bridgeReadyFile, nativeState, stateFile, windowVisibleFile
});

async function currentHead() {
  return resolveWindowsClientHead({ env: process.env, repoRoot, runCapture });
}

const printStatus = createStatusPrinter({
  nativeWindowHealthScript,
  readClientState,
  readReadyState,
  repoRoot
});

async function resetMarkers() {
  await nativeState.resetReadyMarkers({ appReadyFile, bridgeReadyFile, windowVisibleFile });
}

const saveState = (state) => nativeState.saveClientState(stateFile, state);

async function waitForReady(session, shellPid) {
  const deadline = Date.now() + healthTimeoutMs;
  while (Date.now() < deadline) {
    const ready = readReadyState();
    if (ready?.appReady.session === session) {
      const windowHealth = await readNativeWindowHealth({
        nativeWindowHealthScript,
        repoRoot,
        runtimePid: ready.windowVisible.pid
      });
      if (windowHealth.ok) {
        return ready;
      }
    }
    if (!nativeState.processAlive(shellPid)) {
      return null;
    }
    await wait(500);
  }
  return null;
}

async function startClient({ print = true } = {}) {
  const head = await currentHead();
  const existing = await printStatus();
  if (existing.ok) {
    if (existing.ready.appReady.head === head) {
      await recoverClientStateFromReady({ currentHead, ready: existing.ready, saveState, state: existing.state });
      return { alreadyRunning: true, ready: existing.ready, state: readClientState() };
    }
    await stopClient({ print: false });
  } else {
    const repoElectronPids = await listRepoElectronPids(repoRoot);
    if (repoElectronPids.length > 0) {
      throw new Error(`untrusted repo runtime still running electron_pids=${repoElectronPids.join(',')}`);
    }
    await stopClient({ print: false });
  }
  await resetMarkers();
  await removeShellRestartRequest(shellRestartRequestFile);
  const session = `windows-native-client-${Date.now()}`;
  const logs = await createClientLogStreams(logDir, session);
  closeClientLogStreams(logs);
  const shellPid = await startNativeDevRunner({ head, logs, nativeStartScript, repoRoot, session });
  const startedAt = new Date().toISOString();
  await saveState({
    head,
    session,
    shellPid,
    startedAt,
    stderrLog: logs.stderrLog,
    stdoutLog: logs.stdoutLog
  });
  const ready = await waitForReady(session, shellPid);
  if (!ready) {
    printStartupLogTail(readClientState());
    const failureReason = formatStartupHealthFailure({
      bootEvent: readStartupFailureFromBootEvents(bootEventLogFile, { session }),
      stderrLog: logs.stderrLog
    });
    if (nativeState.processAlive(shellPid)) {
      await saveState({
        failedAt: new Date().toISOString(),
        head,
        lastError: failureReason,
        session,
        shellPid,
        startedAt,
        stderrLog: logs.stderrLog,
        stdoutLog: logs.stdoutLog
      });
    } else {
      await nativeState.removeClientState(stateFile);
    }
    await resetMarkers();
    throw new Error(`startup health check failed: ${failureReason} shell_pid=${shellPid} left-for-inspection`);
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
    removeClientState: () => nativeState.removeClientState(stateFile),
    repoRoot,
    resetMarkers
  });
}

async function restartClient() {
  const existing = await printStatus();
  if (!existing.ok) {
    const started = await startClient({ print: false });
    console.log(`[windows-restart-client] status: STARTED shell_pid=${started.state.shellPid} runtime_pid=${started.ready.windowVisible.pid}`);
    return;
  }
  await restartRuntimeClient({
    currentHead,
    healthTimeoutMs,
    readClientState,
    readReadyState,
    recoverClientStateFromReady,
    removeClientState: () => nativeState.removeClientState(stateFile),
    repoRoot,
    restartDeliveryFile,
    resetMarkers,
    saveState,
    startClient,
    stopClient,
    wait
  });
}

async function main() {
  const action = resolveWindowsClientAction(process.argv);
  console.log(`[windows-client-native] action=${action}`);
  console.log(`[windows-client-native] workdir=${repoRoot}`);
  if (await dispatchWindowsNativeClientAction({
    action,
    installScript: nativeTaskInstallScript,
    repoRoot,
    stateRoot: nativeTaskStateRoot,
    workerScript: nativeTaskWorkerScript
  })) return;
  if (action === 'status') {
    await recoverClientStateFromStatus({ currentHead, saveState, status: await printStatus() });
  } else if (action === 'start') {
    await startClient();
  } else if (action === 'stop') {
    await stopClient();
  } else if (action === 'restart') {
    await restartClient();
  } else if (action === 'full-restart') {
    await forceRestartClient({
      currentHead,
      mode: 'full-shell-restart',
      readClientState,
      readReadyState,
      recoverClientStateFromReady,
      removeClientState: () => nativeState.removeClientState(stateFile),
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
