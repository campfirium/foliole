import { promises as fs } from 'node:fs';

import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { findAttachmentBlobManifestById } from '../database/attachmentBlobs.js';

export const ATTACHMENT_RESOURCE_PATH = '/companion/attachment-resource';

export type CompanionAttachmentResourceResult =
  | {
      contentLength: number;
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
  contentHash: string | null
): Promise<CompanionAttachmentResourceResult> {
  const normalizedAttachmentId = attachmentId?.trim() ?? '';
  const normalizedContentHash = contentHash?.trim() ?? '';
  if (!normalizedAttachmentId || !normalizedContentHash) {
    return errorResult('invalid_request', 400);
  }

  const manifest = findAttachmentBlobManifestById(normalizedAttachmentId);
  if (!manifest?.contentHash || manifest.contentHash !== normalizedContentHash) {
    return errorResult('content_hash_mismatch', manifest ? 409 : 404);
  }

  const resolved = resolveAttachmentFile(normalizedAttachmentId);
  if (resolved.status === 'not_found') {
    return errorResult('not_found', 404);
  }
  if (resolved.status === 'missing_file') {
    return errorResult('missing_file', 404);
  }

  const stats = await fs.stat(resolved.filePath);
  return { contentLength: stats.size, filePath: resolved.filePath, mimeType: resolved.mimeType, status: 'ready' };
}
