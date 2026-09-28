import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeExportNodePdfResult } from '../../../../lib/platform/nativeUtilityContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

function isExportResult(value: unknown): value is NativeExportNodePdfResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['saved', 'cancelled', 'not_found', 'missing_file', 'save_failed'].includes(String(candidate.status)) &&
    (candidate.status === 'saved' ? typeof candidate.path === 'string' : candidate.path === null);
}

export async function exportNodePdf(nodeId: string) {
  const invoke = getRuntimeInvoke();
  if (!invoke) return null;
  const result = await invoke(NATIVE_COMMANDS.exportNodePdf, { node_id: nodeId });
  return isExportResult(result) ? result : null;
}
