
import { ASSET_MARKDOWN_SCHEME } from '../../../platform/assetMarkdownUrl.js';
import type { PreparedImportEmbeddedImage } from '../contract.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../markdownImageReferences.js';

import { archiveEmbeddedImage } from './epubBookEntries.js';
import { resolveImageMimeType } from './epubImageMimeType.js';
import { epubPath as path } from './epubPath.js';

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
    const mimeType = resolveImageMimeType(archivePath);
    if (!mimeType) {
      continue;
    }
    seenDestinations.add(parsedTarget.destination);
    const metadata = {
      destination: parsedTarget.destination,
      mimeType,
      originalName: path.posix.basename(archivePath)
    };
    const image = archiveEmbeddedImage(entries, archivePath, metadata);
    if (image) managedImages.push(image);
  }

  return managedImages;
}

export function holdsOnlyCoverImage(content: string, chapterHref: string, coverImagePaths: ReadonlySet<string>) {
  const body = content.replace(/^#{1,6}\s.*$/gm, (line) => (line.includes('![') ? line : '')).trim();
  const references = collectMarkdownImageReferences(body);
  if (references.length === 0) return false;
  const remainder = references.reduce((text, reference) => text.replace(reference.fullMatch, ''), body);
  return !remainder.trim() && references.every((reference) => {
    const destination = parseMarkdownImageTarget(reference.rawTarget)?.destination;
    const archivePath = destination ? resolveArchivePath(chapterHref, destination) : null;
    return Boolean(archivePath && coverImagePaths.has(archivePath));
  });
}
