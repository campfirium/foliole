import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isDataUrlDestination } from '../../lib/platform/markdownImageDataUrl.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { buildAttachmentStorageFileName } from '../attachments/storagePath.js';

import { upsertAttachmentBlobManifest } from './attachmentBlobs.js';
import {
  createAttachmentRecord,
  createNodeAttachmentLink,
  deleteNodeAttachmentLink,
  findAttachmentRecordById,
  listNodeAttachments
} from './attachments.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from './pdfIndexing.js';

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

function decodeMarkdownPath(destination: string) {
  try {
    return decodeURIComponent(destination);
  } catch {
    return destination;
  }
}

function resolveExternalAttachmentRoot(sourceLocator: string) {
  const normalizedSourceLocator = sourceLocator.trim().toLowerCase();
  if (!normalizedSourceLocator) return null;
  const matchingFolder = loadExternalSearchFolders().find((folder) => {
    const normalizedFolderPath = folder.folder_path.trim().toLowerCase();
    return normalizedFolderPath && normalizedSourceLocator.startsWith(normalizedFolderPath);
  });
  return matchingFolder?.attachment_root_path?.trim() || null;
}

function resolveLocalImageSourcePaths(destination: string, sourceLocator: string) {
  const decodedDestination = decodeMarkdownPath(destination);
  if (isAbsoluteLocalPath(decodedDestination)) return [decodedDestination];
  const candidates: string[] = [];
  if (sourceLocator.trim()) candidates.push(path.resolve(path.dirname(sourceLocator), decodedDestination));
  const attachmentRootPath = resolveExternalAttachmentRoot(sourceLocator);
  if (attachmentRootPath) candidates.push(path.resolve(attachmentRootPath, decodedDestination));
  return [...new Set(candidates)];
}

function resolveMimeType(sourcePath: string) {
  return SUPPORTED_IMAGE_MIME_TYPES.get(path.extname(sourcePath).toLowerCase()) ?? null;
}

function persistAttachmentFile(storagePath: string, bytes: Uint8Array) {
  if (fs.existsSync(storagePath)) return;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  fs.writeFileSync(storagePath, bytes, { flag: 'wx' });
}

function createAttachmentRecordIfNeeded(hash: string, sourcePath: string, mimeType: string, sizeBytes: number) {
  const existingAttachment = findAttachmentRecordById(hash);
  if (existingAttachment) return existingAttachment;
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

function recordAttachmentBlobManifest(input: {
  attachment: ReturnType<typeof createAttachmentRecordIfNeeded>;
  hash: string;
  mimeType: string;
  sizeBytes: number;
}) {
  upsertAttachmentBlobManifest({
    attachmentId: input.attachment.id,
    contentHash: input.hash,
    storageKey: buildAttachmentStorageFileName(input.hash, input.attachment.originalName),
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
    availability: 'local',
    sourceDeviceId: null,
    createdAt: input.attachment.createdAt,
    cachedAt: input.attachment.createdAt,
    lastVerifiedAt: input.attachment.createdAt
  });
}

function importLocalImageAttachment(nodeId: string, sourcePath: string) {
  const mimeType = resolveMimeType(sourcePath);
  if (!mimeType) return { message: `Unsupported local image: ${sourcePath}`, status: 'error' as const };
  if (!fs.existsSync(sourcePath)) return { message: `Missing local image: ${sourcePath}`, status: 'error' as const };
  try {
    const sourceBytes = fs.readFileSync(sourcePath);
    const hash = createContentHash(sourceBytes);
    const existingAttachment = findAttachmentRecordById(hash);
    persistAttachmentFile(
      resolveAttachmentStoragePath(hash, undefined, existingAttachment?.originalName ?? path.basename(sourcePath)),
      sourceBytes
    );
    const attachment = createAttachmentRecordIfNeeded(hash, sourcePath, mimeType, sourceBytes.byteLength);
    recordAttachmentBlobManifest({ attachment, hash, mimeType, sizeBytes: sourceBytes.byteLength });
    createNodeAttachmentLink({ attachmentId: attachment.id, nodeId, role: IMAGE_ATTACHMENT_ROLE });
    return { attachmentId: attachment.id, originalName: attachment.originalName, status: 'imported' as const };
  } catch {
    return { message: `Local image unavailable: ${sourcePath}`, status: 'error' as const };
  }
}

export function importMarkdownImageAttachment(input: {
  destination: string;
  nodeId: string;
  sourceLocator: string;
  syntax: 'markdown' | 'obsidian';
}) {
  if (isRemoteImageDestination(input.destination) || isDataUrlDestination(input.destination) || input.destination.startsWith('asset://')) {
    return { status: 'skipped' as const };
  }
  const candidatePaths = resolveLocalImageSourcePaths(input.destination, input.sourceLocator);
  const sourcePath = candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? candidatePaths[0] ?? null;
  if (!sourcePath || (input.syntax === 'obsidian' && !resolveMimeType(sourcePath))) {
    return { status: 'skipped' as const };
  }
  return importLocalImageAttachment(input.nodeId, sourcePath);
}

function replaceNodePdfAttachmentLink(nodeId: string, attachmentId: string) {
  for (const entry of listNodeAttachments(nodeId)) {
    if (entry.role === PDF_ATTACHMENT_ROLE && entry.attachment.mimeType === PDF_MIME_TYPE && entry.attachmentId !== attachmentId) {
      deleteNodeAttachmentLink({ nodeId, attachmentId: entry.attachmentId, role: entry.role });
    }
  }
  createNodeAttachmentLink({ attachmentId, nodeId, role: PDF_ATTACHMENT_ROLE });
}

export function importPdfSourceAttachment(nodeId: string, sourcePath: string) {
  if (!sourcePath.trim() || !fs.existsSync(sourcePath)) return null;
  const sourceBytes = fs.readFileSync(sourcePath);
  const hash = createContentHash(sourceBytes);
  const existingAttachment = findAttachmentRecordById(hash);
  persistAttachmentFile(
    resolveAttachmentStoragePath(hash, undefined, existingAttachment?.originalName ?? path.basename(sourcePath)),
    sourceBytes
  );
  const attachment = createAttachmentRecordIfNeeded(hash, sourcePath, PDF_MIME_TYPE, sourceBytes.byteLength);
  recordAttachmentBlobManifest({ attachment, hash, mimeType: PDF_MIME_TYPE, sizeBytes: sourceBytes.byteLength });
  replaceNodePdfAttachmentLink(nodeId, attachment.id);
  markPdfAttachmentIndexPending(attachment.id);
  enqueuePdfAttachmentIndexing(attachment.id);
  return attachment.id;
}
