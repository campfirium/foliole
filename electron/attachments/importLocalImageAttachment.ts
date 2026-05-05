import { promises as fs } from 'node:fs';

import type {
  NativeImportLocalImageAttachmentResult
} from '../../lib/platform/nativeStorageContract.js';

import { importImageAttachmentBytes, resolveImageMimeType } from './importImageAttachmentBytes.js';

function createErrorResult(
  errorCode: 'source_not_found' | 'source_read_failed',
  message: string,
  sourcePath: string
): NativeImportLocalImageAttachmentResult {
  return {
    status: 'error',
    error_code: errorCode,
    message,
    source_path: sourcePath
  };
}

async function readSourceBytes(sourcePath: string) {
  try {
    return await fs.readFile(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function importLocalImageAttachment(
  nodeId: string,
  sourcePath: string
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedNodeId = nodeId.trim();
  const normalizedSourcePath = sourcePath.trim();
  const mimeType = resolveImageMimeType(normalizedSourcePath);

  if (!mimeType) {
    return {
      status: 'error',
      error_code: 'unsupported_format',
      message: 'Only png, jpg, jpeg, webp, and gif images are supported.',
      source_path: normalizedSourcePath
    };
  }

  let sourceBytes: Uint8Array | null;
  try {
    sourceBytes = await readSourceBytes(normalizedSourcePath);
  } catch {
    return createErrorResult('source_read_failed', 'The source image could not be read.', normalizedSourcePath);
  }

  if (!sourceBytes) {
    return createErrorResult('source_not_found', 'The source image file does not exist.', normalizedSourcePath);
  }

  return importImageAttachmentBytes({
    bytes: sourceBytes,
    errorSource: normalizedSourcePath,
    mimeType,
    nodeId: normalizedNodeId,
    originalName: normalizedSourcePath
  });
}
