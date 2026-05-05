import type {
  NativeImportClipboardImageAttachmentArgs,
  NativeImportLocalImageAttachmentResult
} from '../../lib/platform/nativeStorageContract.js';

import { importImageAttachmentBytes, normalizeImageFileName } from './importImageAttachmentBytes.js';

function decodeBase64Bytes(encoded: string) {
  return Uint8Array.from(Buffer.from(encoded, 'base64'));
}

export async function importClipboardImageAttachment(
  args: NativeImportClipboardImageAttachmentArgs
): Promise<NativeImportLocalImageAttachmentResult> {
  return importImageAttachmentBytes({
    bytes: decodeBase64Bytes(args.bytesBase64),
    errorSource: '[clipboard-image]',
    mimeType: args.mimeType,
    nodeId: args.nodeId,
    originalName: normalizeImageFileName(args.originalName, args.mimeType)
  });
}
