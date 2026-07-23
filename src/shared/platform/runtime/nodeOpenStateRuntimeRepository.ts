import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeNodeOpenStateResult } from '../../../../lib/platform/nativeNodeOpenStateContract';
import { getRuntimeInvoke } from '../runtimeInvoke';
import { logRuntimeError } from '../runtimeLogging';

export async function saveNodeOpenStateToRuntime(
  nodeId: string,
  lastOpenedAt: string
): Promise<NativeNodeOpenStateResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return null;
  try {
    return await runtimeInvoke(NATIVE_COMMANDS.saveNodeOpenState, { nodeId, lastOpenedAt });
  } catch (error) {
    logRuntimeError('node open state save failed', {
      area: 'persistence', action: 'save_node_open_state', fallback: 'keep_previous_last_opened',
      error, nodeId
    });
    return null;
  }
}
