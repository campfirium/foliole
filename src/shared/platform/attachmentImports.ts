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

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function importClipboardImageAttachmentBytes(args: {
  bytesBase64: string;
  mimeType: string;
  nodeId: string;
  originalName?: string;
}) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  const result = await runtimeInvoke(NATIVE_COMMANDS.importClipboardImageAttachment, args);

  return isImportResult(result) ? result : null;
}

export async function importClipboardImageAttachment(nodeId: string, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return importClipboardImageAttachmentBytes({
    bytesBase64: encodeBytesToBase64(bytes),
    mimeType: file.type,
    nodeId,
    originalName: file.name
  });
}
