import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';

import { importImageAttachmentBytes } from './importImageAttachmentBytes.js';

interface ImportImageAttachmentResourceInput {
  bytes: Uint8Array;
  errorSource: string;
  mimeType: string;
  originalName: string;
}

export async function importImageAttachmentResource(
  input: ImportImageAttachmentResourceInput
): Promise<NativeImportLocalImageAttachmentResult> {
  return importImageAttachmentBytes(input);
}
