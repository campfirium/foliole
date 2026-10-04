import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isDataUrlDestination, normalizeSafeMarkdownDataImageUrl } from '../../lib/platform/markdownImageDataUrl.js';
import { prepareCanonicalImageAttachment } from '../attachments/importImageAttachmentBytes.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { openDatabaseConnection } from './connection.js';
import { resolveExternalSearchFolder } from './externalSearchFolderOwnership.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { persistNodeResourceReference, replaceNodePdfResourceReference } from './nodeResources.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending } from './pdfIndexing.js';

const IMAGE_ATTACHMENT_ROLE = 'image';
const PDF_ATTACHMENT_ROLE = 'reference';
const PDF_MIME_TYPE = 'application/pdf';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.gif', '.jpeg', '.jpg', '.png', '.webp'
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
  const matchingFolder = resolveExternalSearchFolder(sourceLocator, loadExternalSearchFolders());
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
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(sourcePath).toLowerCase());
}

function persistAttachmentFile(storagePath: string, bytes: Uint8Array) {
  if (fs.existsSync(storagePath)) {
    if (createContentHash(fs.readFileSync(storagePath)) !== createContentHash(bytes)) {
      throw new Error('canonical attachment path contains different bytes');
    }
    return false;
  }
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  fs.writeFileSync(storagePath, bytes, { flag: 'wx' });
  return true;
}

function importLocalImageAttachment(nodeId: string, sourcePath: string) {
  if (!fs.existsSync(sourcePath)) return { message: `Missing local image: ${sourcePath}`, status: 'error' as const };
  let createdFile = false;
  let storagePath = '';
  try {
    const sourceBytes = fs.readFileSync(sourcePath);
    const prepared = prepareCanonicalImageAttachment(sourceBytes);
    if (!prepared) return { message: `Unsupported local image: ${sourcePath}`, status: 'error' as const };
    storagePath = resolveAttachmentStoragePath(prepared.hash, undefined, prepared.mimeType);
    createdFile = persistAttachmentFile(storagePath, sourceBytes);
    openDatabaseConnection().driver.transaction(() => {
      persistNodeResourceReference(nodeId, {
        storage_key: prepared.storageKey, original_name: path.basename(sourcePath), role: IMAGE_ATTACHMENT_ROLE
      });
    });
    return {
      attachmentId: prepared.hash, mimeType: prepared.mimeType, originalName: path.basename(sourcePath),
      status: 'imported' as const, storageKey: prepared.storageKey
    };
  } catch {
    if (createdFile && storagePath) fs.rmSync(storagePath, { force: true });
    return { message: `Local image unavailable: ${sourcePath}`, status: 'error' as const };
  }
}

export function importMarkdownImageAttachment(input: {
  destination: string;
  nodeId: string;
  sourceLocator: string;
  syntax: 'markdown' | 'obsidian';
}) {
  if (
    isRemoteImageDestination(input.destination) ||
    isDataUrlDestination(input.destination) ||
    normalizeSafeMarkdownDataImageUrl(input.destination) ||
    input.destination.startsWith('asset://')
  ) {
    return { status: 'skipped' as const };
  }
  const candidatePaths = resolveLocalImageSourcePaths(input.destination, input.sourceLocator);
  const sourcePath = candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? candidatePaths[0] ?? null;
  if (!sourcePath || (input.syntax === 'obsidian' && !resolveMimeType(sourcePath))) {
    return { status: 'skipped' as const };
  }
  return importLocalImageAttachment(input.nodeId, sourcePath);
}

export function importPdfSourceAttachment(nodeId: string, sourcePath: string) {
  if (!sourcePath.trim() || !fs.existsSync(sourcePath)) return null;
  const sourceBytes = fs.readFileSync(sourcePath);
  const hash = createContentHash(sourceBytes);
  persistAttachmentFile(
    resolveAttachmentStoragePath(hash, undefined, PDF_MIME_TYPE),
    sourceBytes
  );
  replaceNodePdfResourceReference(nodeId, {
    storage_key: `${hash}.pdf`, original_name: path.basename(sourcePath), role: PDF_ATTACHMENT_ROLE
  });
  markPdfAttachmentIndexPending(hash);
  enqueuePdfAttachmentIndexing(hash);
  return hash;
}
