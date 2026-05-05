import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver
} from '../../lib/core/database/index.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { createAttachmentRecord, createNodeAttachmentLink, findAttachmentRecordById } from '../database/attachments.js';

import { openDatabaseConnection } from './connection.js';
import { rewriteInlineImageReferences } from './inlineImageReferences.js';

export type { PersistedImportRecord, PreparedImportRecord };

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

function decodeMarkdownPath(destination: string) {
  try {
    return decodeURIComponent(destination);
  } catch {
    return destination;
  }
}

function isRemoteImageDestination(destination: string) {
  try {
    const parsedUrl = new URL(destination);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAbsoluteLocalPath(destination: string) {
  return path.isAbsolute(destination) || path.posix.isAbsolute(destination) || path.win32.isAbsolute(destination);
}

function resolveLocalImageSourcePath(destination: string, sourceLocator: string) {
  const decodedDestination = decodeMarkdownPath(destination);
  if (isAbsoluteLocalPath(decodedDestination)) {
    return decodedDestination;
  }
  if (!sourceLocator.trim()) {
    return null;
  }
  return path.resolve(path.dirname(sourceLocator), decodedDestination);
}

function resolveMimeType(sourcePath: string) {
  return SUPPORTED_IMAGE_MIME_TYPES.get(path.extname(sourcePath).toLowerCase()) ?? null;
}

function persistAttachmentFile(storagePath: string, bytes: Uint8Array) {
  if (fs.existsSync(storagePath)) {
    return 'reused' as const;
  }
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  fs.writeFileSync(storagePath, bytes, { flag: 'wx' });
  return 'created' as const;
}

function createAttachmentRecordIfNeeded(hash: string, sourcePath: string, mimeType: string, sizeBytes: number) {
  const existingAttachment = findAttachmentRecordById(hash);
  if (existingAttachment) {
    return existingAttachment;
  }
  const attachment = {
    id: hash,
    originalName: path.basename(sourcePath),
    mimeType,
    sizeBytes,
    createdAt: new Date().toISOString()
  };
  createAttachmentRecord(attachment);
  return attachment;
}

function importLocalImageAttachment(nodeId: string, sourcePath: string) {
  const mimeType = resolveMimeType(sourcePath);
  if (!mimeType) {
    return { message: `Unsupported local image: ${sourcePath}`, status: 'error' as const };
  }
  if (!fs.existsSync(sourcePath)) {
    return { message: `Missing local image: ${sourcePath}`, status: 'error' as const };
  }

  try {
    const sourceBytes = fs.readFileSync(sourcePath);
    const hash = createContentHash(sourceBytes);
    persistAttachmentFile(resolveAttachmentStoragePath(hash), sourceBytes);
    const attachment = createAttachmentRecordIfNeeded(hash, sourcePath, mimeType, sourceBytes.byteLength);
    createNodeAttachmentLink({ attachmentId: attachment.id, nodeId, role: IMAGE_ATTACHMENT_ROLE });
    return { attachmentId: attachment.id, status: 'imported' as const };
  } catch {
    return { message: `Local image unavailable: ${sourcePath}`, status: 'error' as const };
  }
}

function appendDegradedReason(currentReason: string | null, nextReason: string | null) {
  if (!nextReason) {
    return currentReason;
  }
  if (!currentReason) {
    return nextReason;
  }
  return `${currentReason}; ${nextReason}`;
}

function rewriteMarkdownLocalImages(record: PersistedImportRecord, prepared: PreparedImportRecord) {
  if (
    prepared.sourceKind !== 'markdown' ||
    !record.nodeId ||
    record.duplicateSemantic === 'duplicate' ||
    prepared.content.trim().length === 0
  ) {
    return record;
  }

  const nodeId = record.nodeId;
  const degradedMessages: string[] = [];
  const rewrittenContent = rewriteInlineImageReferences(prepared.content, (reference) => {
    if (isRemoteImageDestination(reference.destination) || reference.destination.startsWith('attachment://')) {
      return reference.fullMatch;
    }

    const sourcePath = resolveLocalImageSourcePath(reference.destination, prepared.sourceLocator);
    if (!sourcePath) {
      return reference.fullMatch;
    }
    if (reference.syntax === 'obsidian' && !resolveMimeType(sourcePath)) {
      return reference.fullMatch;
    }

    const importResult = importLocalImageAttachment(nodeId, sourcePath);
    if (importResult.status === 'error') {
      degradedMessages.push(importResult.message);
      return `[${importResult.message}]`;
    }

    const suffix = reference.suffix ? ` ${reference.suffix}` : '';
    return `![${reference.altText}](attachment://${importResult.attachmentId}${suffix})`;
  });

  if (rewrittenContent === prepared.content && degradedMessages.length === 0) {
    return record;
  }

  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET content = ?, updated_at = ? WHERE id = ?', [rewrittenContent, record.importedAt, nodeId]);

  if (degradedMessages.length === 0) {
    return record;
  }

  const degradedReason = appendDegradedReason(
    record.degradedReason,
    `Markdown local image import degraded: ${degradedMessages.join(' | ')}`
  );

  connection.driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);

  return {
    ...record,
    degradedReason,
    resultStatus: 'degraded' as const
  };
}

export function runPreparedImport(input: PreparedImportRecord) {
  return rewriteMarkdownLocalImages(runPreparedImportViaDriver(openDatabaseConnection().driver, input), input);
}

export function recordPreparedImportFailure(input: PreparedImportRecord, failureReason: string) {
  return recordPreparedImportFailureViaDriver(openDatabaseConnection().driver, input, failureReason);
}
