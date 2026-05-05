import path from 'node:path';

import type { PreparedImportEmbeddedImage } from '../../lib/core/import/contract.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../../lib/core/import/markdownImageReferences.js';
import { ASSET_MARKDOWN_SCHEME } from '../../lib/platform/assetMarkdownUrl.js';
import { resolveImageMimeType } from '../attachments/importImageAttachmentBytes.js';

function decodeDestination(destination: string) {
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

function resolveArchivePath(chapterHref: string, destination: string) {
  const decodedDestination = decodeDestination(destination).split('#')[0]?.trim() ?? '';
  if (!decodedDestination) {
    return null;
  }
  const normalizedDestination = decodedDestination.startsWith('/') ? decodedDestination.slice(1) : decodedDestination;
  return path.posix.normalize(path.posix.join(path.posix.dirname(chapterHref), normalizedDestination));
}

export function collectManagedEpubImages(
  content: string,
  chapterHref: string,
  entries: ReadonlyMap<string, Uint8Array>
): PreparedImportEmbeddedImage[] {
  const managedImages: PreparedImportEmbeddedImage[] = [];
  const seenDestinations = new Set<string>();

  for (const reference of collectMarkdownImageReferences(content)) {
    const parsedTarget = parseMarkdownImageTarget(reference.rawTarget);
    if (!parsedTarget) {
      continue;
    }
    if (
      seenDestinations.has(parsedTarget.destination) ||
      parsedTarget.destination.startsWith(ASSET_MARKDOWN_SCHEME) ||
      isRemoteImageDestination(parsedTarget.destination)
    ) {
      continue;
    }
    const archivePath = resolveArchivePath(chapterHref, parsedTarget.destination);
    if (!archivePath) {
      continue;
    }
    const bytes = entries.get(archivePath);
    if (!bytes) {
      continue;
    }
    const mimeType = resolveImageMimeType(archivePath);
    if (!mimeType) {
      continue;
    }
    seenDestinations.add(parsedTarget.destination);
    managedImages.push({
      bytes,
      destination: parsedTarget.destination,
      mimeType,
      originalName: path.posix.basename(archivePath)
    });
  }

  return managedImages;
}
