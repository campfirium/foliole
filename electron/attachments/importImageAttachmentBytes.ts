import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';
import {
  createAttachmentRecord,
  createNodeAttachmentLink,
  findAttachmentRecordById
} from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';

import { resolveAttachmentStoragePath } from './resourceResolver.js';

const IMAGE_ATTACHMENT_ROLE = 'image';

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

const MIME_TYPE_EXTENSION_MAP = new Map([
  ['image/gif', '.gif'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

const FILE_EXTENSION_MIME_TYPE_MAP = new Map(
  Array.from(MIME_TYPE_EXTENSION_MAP.entries()).map(([mimeType, extension]) => [extension, mimeType])
);
FILE_EXTENSION_MIME_TYPE_MAP.set('.jpeg', 'image/jpeg');

interface ImportImageAttachmentBytesInput {
  bytes: Uint8Array;
  errorSource: string;
  mimeType: string;
  nodeId: string;
  originalName: string;
}

function createContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createErrorResult(
  errorCode: 'node_not_found' | 'source_read_failed' | 'storage_write_failed' | 'unsupported_format',
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

function ensureNodeExists(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>(
    'SELECT id FROM nodes WHERE id = ?',
    [nodeId]
  );
  return Boolean(row);
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
    return {
      attachment: existingAttachment,
      attachmentRecord: 'reused' as const
    };
  }

  const createdAt = new Date().toISOString();
  const attachment = {
    id: hash,
    originalName,
    mimeType,
    sizeBytes,
    createdAt
  };

  createAttachmentRecord(attachment);

  return {
    attachment,
    attachmentRecord: 'created' as const
  };
}

function resolveCanonicalStoragePath(hash: string, originalName: string) {
  const existingAttachment = findAttachmentRecordById(hash);
  return resolveAttachmentStoragePath(hash, undefined, existingAttachment?.originalName ?? originalName);
}

export function normalizeImageFileName(originalName: string | null | undefined, mimeType: string) {
  const trimmedName = originalName?.trim() ?? '';
  if (trimmedName) {
    return path.basename(trimmedName);
  }
  const extension = MIME_TYPE_EXTENSION_MAP.get(mimeType) ?? '.img';
  return `pasted-image${extension}`;
}

export function resolveImageMimeType(fileNameOrPath: string) {
  return FILE_EXTENSION_MIME_TYPE_MAP.get(path.extname(fileNameOrPath).toLowerCase()) ?? null;
}

export async function importImageAttachmentBytes(
  input: ImportImageAttachmentBytesInput
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedNodeId = input.nodeId.trim();
  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  const normalizedOriginalName = normalizeImageFileName(input.originalName, normalizedMimeType);

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return createErrorResult(
      'unsupported_format',
      'Only png, jpg, jpeg, webp, and gif images are supported.',
      input.errorSource
    );
  }

  if (!ensureNodeExists(normalizedNodeId)) {
    return createErrorResult('node_not_found', 'The target node does not exist.', input.errorSource);
  }

  const hash = createContentHash(input.bytes);
  const storagePath = resolveCanonicalStoragePath(hash, normalizedOriginalName);

  let storedFile: 'created' | 'reused';
  try {
    storedFile = await persistAttachmentFile(storagePath, input.bytes);
  } catch {
    return createErrorResult('storage_write_failed', 'The image could not be stored by the app.', input.errorSource);
  }

  const { attachment, attachmentRecord } = createAttachmentRecordIfNeeded(
    hash,
    normalizedOriginalName,
    normalizedMimeType,
    input.bytes.byteLength
  );

  createNodeAttachmentLink({
    nodeId: normalizedNodeId,
    attachmentId: attachment.id,
    role: IMAGE_ATTACHMENT_ROLE
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
