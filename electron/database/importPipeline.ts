import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  recordPreparedImportFailure as recordPreparedImportFailureViaDriver,
  runPreparedImport as runPreparedImportViaDriver
} from '../../lib/core/database/index.js';
import { syncWorkspaceSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import {
  createAttachmentRecord,
  createNodeAttachmentLink,
  deleteNodeAttachmentLink,
  findAttachmentRecordById,
  listNodeAttachments
} from '../database/attachments.js';

import { openDatabaseConnection } from './connection.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { rewriteInlineImageReferences } from './inlineImageReferences.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from './pdfIndexing.js';

export type { PersistedImportRecord, PreparedImportRecord };

const IMAGE_ATTACHMENT_ROLE = 'image';
const PDF_ATTACHMENT_ROLE = 'reference';
const PDF_MIME_TYPE = 'application/pdf';

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

function resolveExternalAttachmentRoot(sourceLocator: string) {
  const normalizedSourceLocator = sourceLocator.trim().toLowerCase();
  if (!normalizedSourceLocator) {
    return null;
  }
  const matchingFolder = loadExternalSearchFolders().find((folder) => {
    const normalizedFolderPath = folder.folder_path.trim().toLowerCase();
    return normalizedFolderPath && normalizedSourceLocator.startsWith(normalizedFolderPath);
  });
  return matchingFolder?.attachment_root_path?.trim() || null;
}

function resolveLocalImageSourcePaths(destination: string, sourceLocator: string) {
  const decodedDestination = decodeMarkdownPath(destination);
  if (isAbsoluteLocalPath(decodedDestination)) {
    return [decodedDestination];
  }
  const candidates: string[] = [];
  if (sourceLocator.trim()) {
    candidates.push(path.resolve(path.dirname(sourceLocator), decodedDestination));
  }
  const attachmentRootPath = resolveExternalAttachmentRoot(sourceLocator);
  if (attachmentRootPath) {
    candidates.push(path.resolve(attachmentRootPath, decodedDestination));
  }
  return [...new Set(candidates)];
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
    const existingAttachment = findAttachmentRecordById(hash);
    persistAttachmentFile(
      resolveAttachmentStoragePath(hash, undefined, existingAttachment?.originalName ?? path.basename(sourcePath)),
      sourceBytes
    );
    const attachment = createAttachmentRecordIfNeeded(hash, sourcePath, mimeType, sourceBytes.byteLength);
    createNodeAttachmentLink({ attachmentId: attachment.id, nodeId, role: IMAGE_ATTACHMENT_ROLE });
    return {
      attachmentId: attachment.id,
      originalName: attachment.originalName,
      status: 'imported' as const
    };
  } catch {
    return { message: `Local image unavailable: ${sourcePath}`, status: 'error' as const };
  }
}

function replaceNodePdfAttachmentLink(nodeId: string, attachmentId: string) {
  for (const entry of listNodeAttachments(nodeId)) {
    if (
      entry.role === PDF_ATTACHMENT_ROLE &&
      entry.attachment.mimeType === PDF_MIME_TYPE &&
      entry.attachmentId !== attachmentId
    ) {
      deleteNodeAttachmentLink({
        nodeId,
        attachmentId: entry.attachmentId,
        role: entry.role
      });
    }
  }

  createNodeAttachmentLink({ attachmentId, nodeId, role: PDF_ATTACHMENT_ROLE });
}

function importPdfSourceAttachment(nodeId: string, sourcePath: string) {
  if (!sourcePath.trim() || !fs.existsSync(sourcePath)) {
    return null;
  }

  const sourceBytes = fs.readFileSync(sourcePath);
  const hash = createContentHash(sourceBytes);
  const existingAttachment = findAttachmentRecordById(hash);
  persistAttachmentFile(
    resolveAttachmentStoragePath(hash, undefined, existingAttachment?.originalName ?? path.basename(sourcePath)),
    sourceBytes
  );
  const attachment = createAttachmentRecordIfNeeded(hash, sourcePath, PDF_MIME_TYPE, sourceBytes.byteLength);
  replaceNodePdfAttachmentLink(nodeId, attachment.id);
  markPdfAttachmentIndexPending(attachment.id);
  enqueuePdfAttachmentIndexing(attachment.id);
  return attachment.id;
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
    if (isRemoteImageDestination(reference.destination) || reference.destination.startsWith('asset://')) {
      return reference.fullMatch;
    }

    const candidatePaths = resolveLocalImageSourcePaths(reference.destination, prepared.sourceLocator);
    const sourcePath = candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? candidatePaths[0] ?? null;
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
    return `![${reference.altText}](${buildAssetMarkdownUrl(importResult.attachmentId, importResult.originalName)}${suffix})`;
  });

  if (rewrittenContent === prepared.content && degradedMessages.length === 0) {
    return record;
  }

  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET content = ?, opening_text = ?, updated_at = ? WHERE id = ?', [
    rewrittenContent,
    resolveNodeOpeningText(rewrittenContent, prepared.nodeTitle),
    record.importedAt,
    nodeId
  ]);
  syncWorkspaceSearchIndexForNodeIds(connection.driver, [nodeId]);

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
  const record = rewriteMarkdownLocalImages(runPreparedImportViaDriver(openDatabaseConnection().driver, input), input);
  if (input.sourceKind !== 'pdf' || !record.nodeId || record.resultStatus === 'failed') {
    return record;
  }

  importPdfSourceAttachment(record.nodeId, input.sourceLocator);
  return record;
}

export function recordPreparedImportFailure(input: PreparedImportRecord, failureReason: string) {
  return recordPreparedImportFailureViaDriver(openDatabaseConnection().driver, input, failureReason);
}
