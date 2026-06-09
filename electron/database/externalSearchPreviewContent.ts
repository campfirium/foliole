import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { buildExtDocImageRenderUrl } from '../../lib/platform/extDocImageProtocolUrl.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { rewriteInlineImageReferences } from './inlineImageReferences.js';

const PREVIEW_IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const PREVIEW_IMAGE_MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

function decodeMarkdownPath(destination: string) {
  try {
    return decodeURIComponent(destination);
  } catch {
    return destination;
  }
}

function isAlreadyResolvedDestination(destination: string) {
  try {
    const parsed = new URL(destination);
    return (
      parsed.protocol === 'asset:' ||
      parsed.protocol === 'data:' ||
      parsed.protocol === 'file:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    );
  } catch {
    return false;
  }
}

function isAbsoluteLocalPath(destination: string) {
  return path.isAbsolute(destination) || path.posix.isAbsolute(destination) || path.win32.isAbsolute(destination);
}

function isPreviewImageFile(filePath: string) {
  return PREVIEW_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolvePreviewImageMimeType(filePath: string) {
  return PREVIEW_IMAGE_MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? null;
}

function isWithinBasePath(candidate: string, basePath: string) {
  const relative = path.relative(basePath, candidate);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveWithinBasePath(basePath: string, destination: string) {
  const resolved = isAbsoluteLocalPath(destination) ? path.resolve(destination) : path.resolve(basePath, destination);
  return isWithinBasePath(resolved, basePath) ? resolved : null;
}

function resolveCandidatePaths(
  destination: string,
  absolutePath: string,
  folder: NativeExternalSearchFolder | null
) {
  const decodedDestination = decodeMarkdownPath(destination);
  const candidates: string[] = [];
  const documentPath = resolveWithinBasePath(path.dirname(absolutePath), decodedDestination);
  if (documentPath) {
    candidates.push(documentPath);
  }
  if (folder?.attachment_root_path?.trim()) {
    const attachmentPath = resolveWithinBasePath(folder.attachment_root_path, decodedDestination);
    if (attachmentPath) {
      candidates.push(attachmentPath);
    }
  }
  return [...new Set(candidates)];
}

export interface ExternalPreviewImageResource {
  filePath: string;
  mimeType: string;
}

export function resolveExternalPreviewImageResource(
  destination: string,
  absolutePath: string,
  folder: NativeExternalSearchFolder | null
) {
  const resolvedPath = resolveCandidatePaths(destination, absolutePath, folder).find(
    (candidate) => isPreviewImageFile(candidate) && existsSync(candidate)
  );
  const mimeType = resolvedPath ? resolvePreviewImageMimeType(resolvedPath) : null;
  return resolvedPath && mimeType ? { filePath: resolvedPath, mimeType } : null;
}

function resolveImagePreviewUrl(
  destination: string,
  absolutePath: string,
  folder: NativeExternalSearchFolder | null
) {
  if (isAlreadyResolvedDestination(destination)) {
    return destination;
  }
  const resolved = resolveExternalPreviewImageResource(destination, absolutePath, folder);
  return resolved
    ? buildExtDocImageRenderUrl({
        documentAbsolutePath: absolutePath,
        imageDestination: destination
      })
    : null;
}

export function resolveExternalPreviewSourceContent(cachedContent: string, absolutePath: string) {
  if (!existsSync(absolutePath)) {
    return cachedContent;
  }
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch {
    return cachedContent;
  }
}

export function rewriteExternalPreviewContent(
  content: string,
  absolutePath: string,
  folder: NativeExternalSearchFolder | null
) {
  return rewriteInlineImageReferences(content, (reference) => {
    const resolved = resolveImagePreviewUrl(reference.destination, absolutePath, folder);
    if (!resolved) {
      return reference.fullMatch;
    }
    return `![${reference.altText}](${resolved}${reference.suffix ? ` ${reference.suffix}` : ''})`;
  });
}
