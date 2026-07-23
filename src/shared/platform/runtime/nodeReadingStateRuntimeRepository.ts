import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeSaveNodeReadingStateArgs } from '../../../../lib/platform/nativeNodeReadingStateContract';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeError } from '../runtimeLogging';

export async function saveNodeReadingStateToRuntime(payload: NativeSaveNodeReadingStateArgs) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return false;
  try {
    await runtimeInvoke(NATIVE_COMMANDS.saveNodeReadingState, payload);
    return true;
  } catch (error) {
    logRuntimeError('node reading state save failed', {
      area: 'persistence', action: 'save_node_reading_state', fallback: 'keep_previous_reading_state',
      error, nodeId: payload.nodeId
    });
    return false;
  }
}
