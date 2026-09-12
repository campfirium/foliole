import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { classifyAttachmentBytes } from '../../lib/platform/attachmentByteClassification.js';
import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';
import { upsertAttachmentBlobManifest } from '../database/attachmentBlobs.js';
import {
  createAttachmentRecord,
  createNodeAttachmentLink,
  findAttachmentRecordById
} from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';
import { readImageIntrinsicSize } from '../import/imageIntrinsicSize.js';

import { resolveAttachmentStoragePath } from './resourceResolver.js';
import { buildAttachmentStorageFileName } from './storagePath.js';

const IMAGE_ATTACHMENT_ROLE = 'image';
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

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
  nodeId?: string;
  originalName: string;
}

function createContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function prepareCanonicalImageAttachment(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const mimeType = classifyAttachmentBytes(bytes);
  if (!MIME_TYPE_EXTENSION_MAP.has(mimeType)) return null;
  const hash = createContentHash(bytes);
  return {
    hash,
    mimeType,
    sizeBytes: bytes.byteLength,
    storageKey: buildAttachmentStorageFileName(hash, mimeType)
  };
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

function toImportedResult(input: {
  attachment: ReturnType<typeof createAttachmentRecordIfNeeded>['attachment'];
  attachmentRecord: 'created' | 'reused';
  intrinsicSize: { height: number; width: number } | null;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  storedFile: 'created' | 'reused';
}): NativeImportLocalImageAttachmentResult {
  const result = {
    status: 'imported' as const,
    attachment_id: input.attachment.id,
    attachment_record: input.attachmentRecord,
    created_at: input.attachment.createdAt,
    hash: input.attachment.id,
    intrinsic_size: input.intrinsicSize,
    mime_type: input.mimeType,
    original_name: input.attachment.originalName ?? normalizeImageFileName('', input.mimeType),
    size_bytes: input.sizeBytes,
    storage_key: input.storageKey,
    stored_file: input.storedFile
  };
  return result;
}

async function persistAttachmentFile(storagePath: string, bytes: Uint8Array) {
  try {
    const existingBytes = await fs.readFile(storagePath);
    if (createContentHash(existingBytes) !== createContentHash(bytes)) {
      throw new Error('canonical attachment path contains different bytes');
    }
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
  const prepared = prepareCanonicalImageAttachment(input.bytes);
  if (!prepared) {
    return createErrorResult('unsupported_format', 'Only valid png, jpg, webp, and gif image bytes are supported.', input.errorSource);
  }
  const normalizedNodeId = input.nodeId?.trim() || null;
  const normalizedOriginalName = normalizeImageFileName(input.originalName, prepared.mimeType);

  if (normalizedNodeId && !ensureNodeExists(normalizedNodeId)) {
    return createErrorResult('node_not_found', 'The target node does not exist.', input.errorSource);
  }

  const existing = findAttachmentRecordById(prepared.hash);
  if (existing && (existing.mimeType !== prepared.mimeType || existing.sizeBytes !== prepared.sizeBytes)) {
    return createErrorResult('storage_write_failed', 'The existing attachment metadata does not match its bytes.', input.errorSource);
  }
  const storagePath = resolveAttachmentStoragePath(prepared.hash, undefined, prepared.mimeType);

  let storedFile: 'created' | 'reused';
  try {
    storedFile = await persistAttachmentFile(storagePath, input.bytes);
  } catch {
    return createErrorResult('storage_write_failed', 'The image could not be stored by the app.', input.errorSource);
  }

  let attachment: ReturnType<typeof createAttachmentRecordIfNeeded>['attachment'];
  let attachmentRecord: 'created' | 'reused';
  try {
    openDatabaseConnection().driver.transaction(() => {
      ({ attachment, attachmentRecord } = createAttachmentRecordIfNeeded(
        prepared.hash, normalizedOriginalName, prepared.mimeType, prepared.sizeBytes
      ));
      upsertAttachmentBlobManifest({
        attachmentId: attachment.id, contentHash: prepared.hash, storageKey: prepared.storageKey,
        sizeBytes: prepared.sizeBytes, mimeType: prepared.mimeType, availability: 'local', sourceHostName: null,
        createdAt: attachment.createdAt, cachedAt: attachment.createdAt, lastVerifiedAt: attachment.createdAt
      });
      if (normalizedNodeId) {
        createNodeAttachmentLink({ nodeId: normalizedNodeId, attachmentId: attachment.id, role: IMAGE_ATTACHMENT_ROLE });
      }
    });
  } catch {
    if (storedFile === 'created') await fs.unlink(storagePath).catch(() => undefined);
    return createErrorResult('storage_write_failed', 'The image could not be stored by the app.', input.errorSource);
  }

  return toImportedResult({
    attachment: attachment!,
    attachmentRecord: attachmentRecord!,
    intrinsicSize: readImageIntrinsicSize(input.bytes),
    mimeType: prepared.mimeType,
    sizeBytes: prepared.sizeBytes,
    storageKey: prepared.storageKey,
    storedFile
  });
}
