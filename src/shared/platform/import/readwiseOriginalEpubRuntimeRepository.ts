import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseOriginalEpubActionState,
  NativeReadwiseOriginalEpubResult
} from '../../../../lib/platform/nativeReadwiseContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function isActionState(value: unknown): value is NativeReadwiseOriginalEpubActionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.node_id === 'string' && [
    'completed', 'not_applicable', 'ready', 'reconnect_required', 'running', 'source_inactive'
  ].includes(String(payload.status));
}

function isActionResult(value: unknown): value is NativeReadwiseOriginalEpubResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.node_id === 'string'
    && ['already_completed', 'completed', 'failed', 'not_applicable', 'source_inactive']
      .includes(String(payload.status))
    && (payload.error_code === undefined || payload.error_code === null || typeof payload.error_code === 'string');
}

export async function loadRuntimeReadwiseOriginalEpubActionState(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.loadReadwiseOriginalEpubActionState, { node_id: nodeId });
  return isActionState(result) ? result : null;
}

export async function useRuntimeReadwiseOriginalEpub(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.useReadwiseOriginalEpub, { node_id: nodeId });
  return isActionResult(result) ? result : null;
}
