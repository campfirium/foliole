import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeCopyAttachmentImageResult,
  NativeExportAttachmentImageResult
} from '../../../lib/platform/nativeUtilityContract';

import { getRuntimeInvoke } from './runtimeInvoke';

function isCopyResult(value: unknown): value is NativeCopyAttachmentImageResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === 'copied' ||
    candidate.status === 'not_found' ||
    candidate.status === 'missing_file' ||
    candidate.status === 'invalid_image'
  );
}

function isExportResult(value: unknown): value is NativeExportAttachmentImageResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === 'saved' ||
    candidate.status === 'cancelled' ||
    candidate.status === 'not_found' ||
    candidate.status === 'missing_file' ||
    candidate.status === 'save_failed'
  );
}

export async function copyAttachmentImageToClipboard(storageKey: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.copyAttachmentImageToClipboard, {
    storage_key: storageKey
  });
  return isCopyResult(result) ? result : null;
}

export async function exportAttachmentImage(storageKey: string, nodeId?: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.exportAttachmentImage, {
    storage_key: storageKey,
    ...(nodeId ? { node_id: nodeId } : {})
  });
  return isExportResult(result) ? result : null;
}
