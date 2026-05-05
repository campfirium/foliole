import path from 'node:path';

import type {
  NativeImportLocalImageAttachmentResult,
  NativeImportRemoteImageAttachmentArgs
} from '../../lib/platform/nativeStorageContract.js';

import { importImageAttachmentBytes, normalizeImageFileName, resolveImageMimeType } from './importImageAttachmentBytes.js';

const REMOTE_IMAGE_TIMEOUT_MS = 12_000;

function createErrorResult(message: string, sourceUrl: string): NativeImportLocalImageAttachmentResult {
  return {
    status: 'error',
    error_code: 'download_failed',
    message,
    source_path: sourceUrl
  };
}

function resolveImageMimeTypeFromResponse(sourceUrl: string, response: Response) {
  const headerValue = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (headerValue.startsWith('image/')) {
    return headerValue;
  }
  return resolveImageMimeType(sourceUrl);
}

function resolveOriginalName(sourceUrl: string, mimeType: string) {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const decodedName = decodeURIComponent(path.basename(pathname));
    return normalizeImageFileName(decodedName, mimeType);
  } catch {
    return normalizeImageFileName('', mimeType);
  }
}

async function fetchRemoteImage(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
  try {
    return await fetch(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function importRemoteImageAttachment(
  args: NativeImportRemoteImageAttachmentArgs
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedSourceUrl = args.sourceUrl.trim();
  const normalizedNodeId = args.nodeId.trim();

  let response: Response;
  try {
    response = await fetchRemoteImage(normalizedSourceUrl);
  } catch {
    return createErrorResult('The remote image could not be downloaded.', normalizedSourceUrl);
  }

  if (!response.ok) {
    return createErrorResult(`The remote image request failed with status ${response.status}.`, normalizedSourceUrl);
  }

  const mimeType = resolveImageMimeTypeFromResponse(normalizedSourceUrl, response);
  if (!mimeType) {
    return {
      status: 'error',
      error_code: 'unsupported_format',
      message: 'Only png, jpg, jpeg, webp, and gif images are supported.',
      source_path: normalizedSourceUrl
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return createErrorResult('The remote image could not be read after download.', normalizedSourceUrl);
  }

  return importImageAttachmentBytes({
    bytes,
    errorSource: normalizedSourceUrl,
    mimeType,
    nodeId: normalizedNodeId,
    originalName: resolveOriginalName(normalizedSourceUrl, mimeType)
  });
}
