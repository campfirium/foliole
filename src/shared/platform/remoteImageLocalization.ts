import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeImportLocalImageAttachmentResult } from '../../../lib/platform/nativeStorageContract';

import { getRuntimeInvoke } from './runtimeInvoke';

function isImportResult(value: unknown): value is NativeImportLocalImageAttachmentResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.status === 'imported' || candidate.status === 'error';
}

export async function importRemoteImageAttachment(nodeId: string, sourceUrl: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  const result = await runtimeInvoke(NATIVE_COMMANDS.importRemoteImageAttachment, {
    nodeId,
    sourceUrl
  });
  return isImportResult(result) ? result : null;
}
