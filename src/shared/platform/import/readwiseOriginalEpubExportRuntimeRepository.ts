import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReadwiseOriginalEpubExportResult } from '../../../../lib/platform/nativeReadwiseContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function isExportResult(value: unknown): value is NativeReadwiseOriginalEpubExportResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (typeof result.node_id !== 'string') return false;
  if (result.status === 'saved') return typeof result.path === 'string';
  return ['cancelled', 'failed', 'not_applicable', 'source_inactive'].includes(String(result.status))
    && result.path === null
    && (result.error_code === undefined || typeof result.error_code === 'string');
}

export async function exportRuntimeReadwiseOriginalEpub(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.exportReadwiseOriginalEpub, { node_id: nodeId });
  return isExportResult(result) && result.node_id === nodeId ? result : null;
}
