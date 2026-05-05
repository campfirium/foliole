import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeExportCurrentArticleMirrorResult } from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './runtimeInvoke';

function isExportResult(value: unknown): value is NativeExportCurrentArticleMirrorResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === 'saved' ||
    candidate.status === 'cancelled' ||
    candidate.status === 'not_found' ||
    candidate.status === 'save_failed'
  );
}

export async function exportCurrentArticleMirror(nodeId: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.exportCurrentArticleMirror, {
    node_id: nodeId
  });
  return isExportResult(result) ? result : null;
}
