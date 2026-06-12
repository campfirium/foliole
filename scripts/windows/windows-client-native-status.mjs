/* global console */

import { formatWindowHealthFailure, readNativeWindowHealth } from './windows-client-native-window-health.mjs';

export function createStatusPrinter({
  nativeWindowHealthScript,
  readClientState,
  readReadyState,
  repoRoot
}) {
  return async function printStatus() {
    const state = readClientState();
    const ready = readReadyState();
    const windowHealth = ready
      ? await readNativeWindowHealth({ nativeWindowHealthScript, repoRoot, runtimePid: ready.windowVisible.pid })
      : null;
    if (ready && windowHealth.ok) {
      const runtimeHead = ready.appReady.head ?? state?.head;
      const head = runtimeHead ? ` head=${runtimeHead}` : '';
      console.log(`[windows-restart-client] status: RUNNING trust=OK shell_pid=${state?.shellPid ?? 'unknown'} runtime_pid=${ready.windowVisible.pid}${head}`);
      return { ok: true, ready, state };
    }
    if (windowHealth && !windowHealth.ok) {
      console.log(`[windows-restart-client] status: STOPPED trust=FAILED${formatWindowHealthFailure(windowHealth)}`);
      return { ok: false, ready: null, state };
    }
    if (state?.shellPid) {
      console.log(`[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime shell_pid=${state.shellPid}`);
      return { ok: false, ready: null, state };
    }
    console.log('[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime');
    return { ok: false, ready: null, state };
  };
}
