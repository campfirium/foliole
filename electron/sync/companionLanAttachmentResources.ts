import { promises as fs } from 'node:fs';

import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { loadAttachmentResourceDescription } from '../database/attachmentResourceDescription.js';

import { recordMissingResourceGetForAcceptance } from './acceptanceResourceGet404.js';

export const ATTACHMENT_RESOURCE_PATH = '/companion/attachment-resource';
export const ATTACHMENT_RANGE_BYTES = 1024 * 1024;

export type CompanionAttachmentResourceResult =
  | {
      contentLength: number;
      byteOffset?: number;
      totalBytes?: number;
      filePath: string;
      mimeType: string | null;
      status: 'ready';
    }
  | {
      error: 'content_hash_mismatch' | 'invalid_request' | 'missing_file' | 'not_found';
      status: 'error';
      statusCode: 400 | 404 | 409;
    };

function errorResult(
  error: CompanionAttachmentResourceResult extends infer T
    ? T extends { error: infer E } ? E : never
    : never,
  statusCode: 400 | 404 | 409
): CompanionAttachmentResourceResult {
  return { error, status: 'error', statusCode };
}

export async function loadCompanionAttachmentResource(
  attachmentId: string | null,
  contentHash: string | null,
  range?: { offset: string | null; length: string | null }
): Promise<CompanionAttachmentResourceResult> {
  const normalizedAttachmentId = attachmentId?.trim() ?? '';
  const normalizedContentHash = contentHash?.trim() ?? '';
  if (!normalizedAttachmentId || !normalizedContentHash) {
    return errorResult('invalid_request', 400);
  }

  const description = loadAttachmentResourceDescription(normalizedAttachmentId);
  if (!description) return errorResult('not_found', 404);
  if (description.contentHash !== normalizedContentHash) return errorResult('content_hash_mismatch', 409);
  const resolved = resolveAttachmentFile(description.storageKey);
  if (resolved.status === 'not_found') {
    return errorResult('not_found', 404);
  }
  if (resolved.status === 'missing_file') {
    await recordMissingResourceGetForAcceptance(normalizedAttachmentId, normalizedContentHash);
    return errorResult('missing_file', 404);
  }

  const stats = await fs.stat(resolved.filePath);
  if (range) {
    const { offset, length } = range;
    if (offset === null || length === null || !/^\d+$/u.test(offset) || !/^\d+$/u.test(length)) {
      return errorResult('invalid_request', 400);
    }
    const start = Number(offset), bytes = Number(length);
    if (!Number.isSafeInteger(start) || start % ATTACHMENT_RANGE_BYTES !== 0 ||
        (start >= stats.size && !(start === 0 && stats.size === 0)) ||
        !Number.isSafeInteger(bytes) || bytes < 1 || bytes > ATTACHMENT_RANGE_BYTES ||
        (bytes !== ATTACHMENT_RANGE_BYTES && bytes !== stats.size - start)) {
      return errorResult('invalid_request', 400);
    }
    return { byteOffset: start, contentLength: Math.min(bytes, stats.size - start),
      totalBytes: stats.size, filePath: resolved.filePath,
      mimeType: resolved.mimeType, status: 'ready' };
  }
  return { contentLength: stats.size, filePath: resolved.filePath, mimeType: resolved.mimeType, status: 'ready' };
}
