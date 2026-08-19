import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';
import { upsertAttachmentBlobManifest } from '../database/attachmentBlobs.js';
import { createAttachmentRecord, findAttachmentRecordById } from '../database/attachments.js';

import { normalizeImageFileName } from './importImageAttachmentBytes.js';
import { resolveAttachmentStoragePath } from './resourceResolver.js';
import { buildAttachmentStorageFileName } from './storagePath.js';

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

interface ImportImageAttachmentResourceInput {
  bytes: Uint8Array;
  errorSource: string;
  mimeType: string;
  originalName: string;
}

function createContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createErrorResult(message: string, sourcePath: string): NativeImportLocalImageAttachmentResult {
  return {
    status: 'error',
    error_code: 'storage_write_failed',
    message,
    source_path: sourcePath
  };
}

async function persistAttachmentFile(storagePath: string, bytes: Uint8Array) {
  try {
    await fs.access(storagePath);
    return 'reused' as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, bytes, { flag: 'wx' });
  return 'created' as const;
}

function createAttachmentRecordIfNeeded(hash: string, originalName: string, mimeType: string, sizeBytes: number) {
  const existingAttachment = findAttachmentRecordById(hash);
  if (existingAttachment) {
    return { attachment: existingAttachment, attachmentRecord: 'reused' as const };
  }
  const createdAt = new Date().toISOString();
  const attachment = { id: hash, originalName, mimeType, sizeBytes, createdAt };
  createAttachmentRecord(attachment);
  return { attachment, attachmentRecord: 'created' as const };
}

export async function importImageAttachmentResource(
  input: ImportImageAttachmentResourceInput
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const normalizedOriginalName = normalizeImageFileName(input.originalName, normalizedMimeType);
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return { status: 'error', error_code: 'unsupported_format', message: 'Unsupported image format.', source_path: input.errorSource };
  }
  const hash = createContentHash(input.bytes);
  const existingAttachment = findAttachmentRecordById(hash);
  const storagePath = resolveAttachmentStoragePath(hash, undefined, existingAttachment?.originalName ?? normalizedOriginalName);
  let storedFile: 'created' | 'reused';
  try {
    storedFile = await persistAttachmentFile(storagePath, input.bytes);
  } catch {
    return createErrorResult('The image could not be stored by the app.', input.errorSource);
  }
  const { attachment, attachmentRecord } = createAttachmentRecordIfNeeded(
    hash,
    normalizedOriginalName,
    normalizedMimeType,
    input.bytes.byteLength
  );
  upsertAttachmentBlobManifest({
    attachmentId: attachment.id,
    contentHash: hash,
    storageKey: buildAttachmentStorageFileName(hash, attachment.originalName ?? normalizedOriginalName),
    sizeBytes: input.bytes.byteLength,
    mimeType: normalizedMimeType,
    availability: 'local',
    sourceHostName: null,
    createdAt: attachment.createdAt,
    cachedAt: attachment.createdAt,
    lastVerifiedAt: attachment.createdAt
  });
  return {
    status: 'imported',
    attachment_id: attachment.id,
    attachment_record: attachmentRecord,
    created_at: attachment.createdAt,
    hash: attachment.id,
    mime_type: normalizedMimeType,
    original_name: attachment.originalName ?? normalizedOriginalName,
    size_bytes: input.bytes.byteLength,
    stored_file: storedFile
  };
}
