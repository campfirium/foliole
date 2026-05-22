/* global console */

import { killPid } from './windows-client-native-process.mjs';

export async function stopNativeClient({
  print,
  readClientState,
  readReadyState,
  removeClientState,
  resetMarkers
}) {
  const state = readClientState();
  const ready = readReadyState();
  const errors = [];
  for (const pid of [state?.runtimePid, ready?.appReady.pid, state?.shellPid]) {
    try {
      await killPid(pid);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const remainingReady = readReadyState();
  if (remainingReady) {
    throw new Error(`client stop failed: ${errors.join('; ') || 'runtime still running'}`);
  }
  await removeClientState();
  await resetMarkers();
  if (print) {
    console.log('[windows-restart-client] status: STOPPED');
  }
}
