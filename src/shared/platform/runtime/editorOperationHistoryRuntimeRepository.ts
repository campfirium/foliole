import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeError } from '../runtimeLogging';

let pendingPayload: string | null = null;
let drainPromise: Promise<void> | null = null;

export async function loadEditorOperationHistoryFromRuntime() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  try {
    return await runtimeInvoke(NATIVE_COMMANDS.loadEditorOperationHistory);
  } catch (error) {
    logRuntimeError('editor operation history load failed', {
      action: 'load_editor_operation_history', area: 'persistence', error, fallback: 'start_empty_history'
    });
    return null;
  }
}

async function drainPendingHistory() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    pendingPayload = null;
    return;
  }
  while (pendingPayload !== null) {
    const payloadJson = pendingPayload;
    pendingPayload = null;
    try {
      await runtimeInvoke(NATIVE_COMMANDS.saveEditorOperationHistory, { payloadJson });
    } catch (error) {
      logRuntimeError('editor operation history save failed', {
        action: 'save_editor_operation_history', area: 'persistence', error, fallback: 'keep_memory_history'
      });
    }
  }
}

export function scheduleEditorOperationHistorySave(payloadJson: string) {
  pendingPayload = payloadJson;
  if (drainPromise) return drainPromise;
  drainPromise = drainPendingHistory().finally(() => {
    drainPromise = null;
    if (pendingPayload !== null) scheduleEditorOperationHistorySave(pendingPayload);
  });
  return drainPromise;
}

export async function flushEditorOperationHistorySave() {
  while (drainPromise || pendingPayload !== null) {
    if (!drainPromise && pendingPayload !== null) {
      scheduleEditorOperationHistorySave(pendingPayload);
    }
    await drainPromise;
  }
}
