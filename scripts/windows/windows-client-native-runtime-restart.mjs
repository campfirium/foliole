/* global console */

import { forceRestartClient } from './windows-client-native-force-restart.mjs';
import {
  requestControlledRuntimeRestart,
  waitForControlledRuntimeReady,
  waitForRestartDelivery
} from './windows-client-native-restart.mjs';

async function acceptControlledRestart({
  currentHeadValue,
  healthTimeoutMs,
  previousSession,
  readClientState,
  readReadyState,
  recoverClientStateFromReady,
  saveState
}) {
  const ready = await waitForControlledRuntimeReady({
    expectedHead: currentHeadValue,
    previousSession,
    readReadyState,
    timeoutMs: healthTimeoutMs
  });
  if (!ready) {
    return false;
  }
  await recoverClientStateFromReady({
    currentHead: async () => currentHeadValue,
    ready,
    saveState,
    state: readClientState()
  });
  const state = readClientState();
  console.log(`[windows-restart-client] status: RESTARTED mode=dev-shell-restart shell_pid=${state?.shellPid ?? 'unknown'} runtime_pid=${ready.windowVisible.pid}`);
  return true;
}

export async function restartRuntimeClient({
  currentHead,
  healthTimeoutMs,
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
  const currentHeadValue = await currentHead();
  const previousSession = readReadyState()?.appReady.session;
  const result = await requestControlledRuntimeRestart({
    head: currentHeadValue,
    reason: 'windows native client restart',
    requestedBy: 'windows-native-client',
    rootDir: repoRoot
  });
  if (
    await waitForRestartDelivery({ deliveryFile: restartDeliveryFile, nonce: result.intent.nonce, timeoutMs: 25000 }) &&
    await acceptControlledRestart({
      currentHeadValue,
      healthTimeoutMs,
      previousSession,
      readClientState,
      readReadyState,
      recoverClientStateFromReady,
      saveState
    })
  ) {
    return;
  }
  console.log('[windows-restart-client] controlled runtime restart unavailable; falling back to process restart');
  await forceRestartClient({
    currentHead,
    mode: 'dev-shell-restart',
    readClientState,
    readReadyState,
    recoverClientStateFromReady,
    removeClientState,
    resetMarkers,
    saveState,
    startClient,
    stopClient,
    wait
  });
}
