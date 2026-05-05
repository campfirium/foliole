import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
    return parsed.protocol === 'asset:' || parsed.protocol === 'file:' || parsed.protocol === 'http:' || parsed.protocol === 'https:';
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

function buildImageDataUrl(filePath: string) {
  const mimeType = PREVIEW_IMAGE_MIME_TYPES.get(path.extname(filePath).toLowerCase());
  if (!mimeType) {
    return null;
  }
  const encoded = readFileSync(filePath).toString('base64');
  return `data:${mimeType};base64,${encoded}`;
}

function resolveCandidatePaths(
  destination: string,
  absolutePath: string,
  folder: NativeExternalSearchFolder | null
) {
  const decodedDestination = decodeMarkdownPath(destination);
  if (isAbsoluteLocalPath(decodedDestination)) {
    return [decodedDestination];
  }
  const candidates = [path.resolve(path.dirname(absolutePath), decodedDestination)];
  if (folder?.attachment_root_path?.trim()) {
    candidates.push(path.resolve(folder.attachment_root_path, decodedDestination));
  }
  return [...new Set(candidates)];
}

function resolveImagePreviewUrl(
  destination: string,
  absolutePath: string,
  folder: NativeExternalSearchFolder | null
) {
  if (isAlreadyResolvedDestination(destination)) {
    return destination;
  }
  const resolvedPath = resolveCandidatePaths(destination, absolutePath, folder).find(
    (candidate) => isPreviewImageFile(candidate) && existsSync(candidate)
  );
  return resolvedPath ? buildImageDataUrl(resolvedPath) : null;
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
