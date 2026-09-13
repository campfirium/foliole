import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeImportLocalImageAttachmentResult } from '../../../lib/platform/nativeStorageContract';

import { loadRemoteImageSourceContext } from './remoteImageSourceRecovery';
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

  const context = await loadRemoteImageSourceContext(sourceUrl, nodeId).catch(() => null);

  const result = await runtimeInvoke(NATIVE_COMMANDS.importRemoteImageAttachment, {
    nodeId,
    sourceOrigin: context?.sourceOrigin ?? null,
    sourceUrl
  });
  return isImportResult(result) ? result : null;
}
