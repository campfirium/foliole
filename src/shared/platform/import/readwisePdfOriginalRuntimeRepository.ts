import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReadwisePdfOriginalActionState, NativeReadwisePdfOriginalResult } from '../../../../lib/platform/nativeReadwiseContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function loadRuntimeReadwisePdfOriginalActionState(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.loadReadwisePdfOriginalActionState, { node_id: nodeId });
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const value = result as unknown as Record<string, unknown>;
  return typeof value.node_id === 'string' &&
    ['not_applicable', 'ready', 'reconnect_required', 'running', 'source_inactive'].includes(String(value.status))
    ? result as NativeReadwisePdfOriginalActionState : null;
}

export async function getRuntimeReadwisePdfOriginal(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.getReadwisePdfOriginal, { node_id: nodeId });
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const value = result as unknown as Record<string, unknown>;
  return typeof value.node_id === 'string' &&
    ['completed', 'failed', 'not_applicable', 'source_inactive'].includes(String(value.status)) &&
    (value.error_code === undefined || value.error_code === null || typeof value.error_code === 'string')
    ? result as NativeReadwisePdfOriginalResult : null;
}
