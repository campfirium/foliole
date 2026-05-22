/* global console */

import { readFile } from 'node:fs/promises';

import { requestCooperativeFullRestart } from './windows-client-native-full-restart.mjs';
import { writeRestartIntent } from './write-restart-intent.mjs';

async function readDeliveryNonce(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')).nonce;
  } catch {
    return null;
  }
}

async function waitForRestartDelivery({ filePath, nonce, timeoutMs, wait }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await readDeliveryNonce(filePath) === nonce) {
      return true;
    }
    await wait(500);
  }
  return false;
}

async function acceptTrustedCurrentRuntime({
  currentHeadValue,
  mode,
  readClientState,
  readReadyState,
  recoverClientStateFromReady,
  saveState
}) {
  const ready = readReadyState();
  const state = readClientState();
  const runtimeHead = ready?.appReady.head ?? state?.head;
  if (!ready || runtimeHead !== currentHeadValue) {
    return false;
  }
  await recoverClientStateFromReady({
    currentHead: async () => currentHeadValue,
    ready,
    saveState,
    state
  });
  const recovered = readClientState();
  console.log(`[windows-restart-client] status: RESTARTED mode=${mode} shell_pid=${recovered?.shellPid ?? 'unknown'} runtime_pid=${ready.windowVisible.pid}`);
  return true;
}

async function requestRuntimeRestartFallback({
  currentHeadValue,
  mode,
  readClientState,
  readReadyState,
  recoverClientStateFromReady,
  repoRoot,
  restartDeliveryFile,
  saveState,
  wait
}) {
  const result = await writeRestartIntent({
    head: currentHeadValue,
    reason: `${mode} fallback runtime restart`,
    requestedBy: 'windows-native-client',
    rootDir: repoRoot
  });
  if (!await waitForRestartDelivery({
    filePath: restartDeliveryFile,
    nonce: result.intent.nonce,
    timeoutMs: 25000,
    wait
  })) {
    return false;
  }
  return acceptTrustedCurrentRuntime({
    currentHeadValue,
    mode,
    readClientState,
    readReadyState,
    recoverClientStateFromReady,
    saveState
  });
}

export async function forceRestartClient({
  currentHead,
  mode,
  readClientState,
  readReadyState,
  recoverClientStateFromReady,
  removeClientState,
  repoRoot,
  resetMarkers,
  restartDeliveryFile,
  saveState,
  startClient,
  stopClient,
  wait
}) {
  console.log(`[windows-restart-client] controlled-stop action=${mode}`);
  const currentHeadValue = await currentHead();
  if (mode === 'full-shell-restart') {
    await recoverClientStateFromReady({
      currentHead: async () => currentHeadValue,
      ready: readReadyState(),
      saveState,
      state: readClientState()
    });
    const started = await requestCooperativeFullRestart({
      currentHead: currentHeadValue,
      readClientState,
      removeClientState,
      resetMarkers,
      restartDeliveryFile,
      repoRoot,
      startClient,
      timeoutMs: 25000,
      wait
    });
    if (started) {
      console.log(`[windows-restart-client] status: RESTARTED mode=${mode} shell_pid=${started.state.shellPid} runtime_pid=${started.ready.windowVisible.pid}`);
      return;
    }
    console.log('[windows-restart-client] cooperative full restart unavailable; trying runtime restart fallback');
    if (await requestRuntimeRestartFallback({
      currentHeadValue,
      mode,
      readClientState,
      readReadyState,
      recoverClientStateFromReady,
      repoRoot,
      restartDeliveryFile,
      saveState,
      wait
    })) {
      return;
    }
    console.log('[windows-restart-client] runtime restart fallback unavailable; falling back to process stop');
  }
  try {
    await stopClient({ print: false });
  } catch (error) {
    if (await acceptTrustedCurrentRuntime({
      currentHeadValue,
      mode,
      readClientState,
      readReadyState,
      recoverClientStateFromReady,
      saveState
    })) {
      return;
    }
    throw error;
  }
  const started = await startClient({ print: false });
  console.log(`[windows-restart-client] status: RESTARTED mode=${mode} shell_pid=${started.state.shellPid} runtime_pid=${started.ready.windowVisible.pid}`);
}
