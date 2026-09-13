import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseSourceResyncActionState,
  NativeReadwiseSourceResyncResult
} from '../../../../lib/platform/nativeReadwiseContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function isActionState(value: unknown): value is NativeReadwiseSourceResyncActionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.node_id === 'string'
    && (payload.category === null || typeof payload.category === 'string')
    && (payload.body_authority === null || payload.body_authority === 'original_epub'
      || payload.body_authority === 'reader_html')
    && ['not_applicable', 'ready', 'reconnect_required', 'running', 'source_inactive']
      .includes(String(payload.status));
}

function isActionResult(value: unknown): value is NativeReadwiseSourceResyncResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.node_id === 'string'
    && ['completed', 'failed', 'not_applicable', 'source_inactive'].includes(String(payload.status))
    && (payload.error_code === undefined || payload.error_code === null
      || typeof payload.error_code === 'string');
}

export async function loadRuntimeReadwiseSourceResyncActionState(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.loadReadwiseSourceResyncActionState, { node_id: nodeId });
  return isActionState(result) ? result : null;
}

export async function resyncRuntimeReadwiseSource(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.resyncReadwiseSource, { node_id: nodeId });
  return isActionResult(result) ? result : null;
}
