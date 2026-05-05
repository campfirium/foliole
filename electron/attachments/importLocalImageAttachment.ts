import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  NativeImportLocalImageAttachmentErrorCode,
  NativeImportLocalImageAttachmentResult
} from '../../lib/platform/nativeStorageContract.js';
import {
  createAttachmentRecord,
  createNodeAttachmentLink,
  findAttachmentRecordByHash
} from '../database/attachments.js';
import { openDatabaseConnection } from '../database/connection.js';

import { resolveAttachmentStoragePath } from './resourceResolver.js';

const IMAGE_ATTACHMENT_ROLE = 'image';

const SUPPORTED_IMAGE_MIME_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);

function createContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createErrorResult(
  errorCode: NativeImportLocalImageAttachmentErrorCode,
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

function resolveMimeType(sourcePath: string) {
  const extension = path.extname(sourcePath).toLowerCase();
  return SUPPORTED_IMAGE_MIME_TYPES.get(extension) ?? null;
}

function ensureNodeExists(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>(
    'SELECT id FROM nodes WHERE id = ?',
    [nodeId]
  );
  return Boolean(row);
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

function createAttachmentRecordIfNeeded(hash: string, sourcePath: string, mimeType: string, sizeBytes: number) {
  const existingAttachment = findAttachmentRecordByHash(hash);
  if (existingAttachment) {
    return {
      attachment: existingAttachment,
      attachmentRecord: 'reused' as const
    };
  }

  const createdAt = new Date().toISOString();
  const attachment = {
    id: `attachment-${randomUUID()}`,
    hash,
    originalName: path.basename(sourcePath),
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

export async function importLocalImageAttachment(
  nodeId: string,
  sourcePath: string
): Promise<NativeImportLocalImageAttachmentResult> {
  const normalizedNodeId = nodeId.trim();
  const normalizedSourcePath = sourcePath.trim();
  const mimeType = resolveMimeType(normalizedSourcePath);

  if (!mimeType) {
    return createErrorResult(
      'unsupported_format',
      'Only png, jpg, jpeg, webp, and gif images are supported.',
      normalizedSourcePath
    );
  }

  if (!ensureNodeExists(normalizedNodeId)) {
    return createErrorResult('node_not_found', 'The target node does not exist.', normalizedSourcePath);
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

  const hash = createContentHash(sourceBytes);
  const storagePath = resolveAttachmentStoragePath(hash);

  let storedFile: 'created' | 'reused';
  try {
    storedFile = await persistAttachmentFile(storagePath, sourceBytes);
  } catch {
    return createErrorResult('storage_write_failed', 'The image could not be stored by the app.', normalizedSourcePath);
  }

  const { attachment, attachmentRecord } = createAttachmentRecordIfNeeded(
    hash,
    normalizedSourcePath,
    mimeType,
    sourceBytes.byteLength
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
    hash: attachment.hash,
    mime_type: mimeType,
    original_name: attachment.originalName ?? path.basename(normalizedSourcePath),
    size_bytes: sourceBytes.byteLength,
    stored_file: storedFile
  };
}
