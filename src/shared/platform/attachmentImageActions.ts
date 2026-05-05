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

export async function copyAttachmentImageToClipboard(attachmentId: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.copyAttachmentImageToClipboard, {
    attachment_id: attachmentId
  });
  return isCopyResult(result) ? result : null;
}

export async function exportAttachmentImage(attachmentId: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  const result = await runtimeInvoke(NATIVE_COMMANDS.exportAttachmentImage, {
    attachment_id: attachmentId
  });
  return isExportResult(result) ? result : null;
}
