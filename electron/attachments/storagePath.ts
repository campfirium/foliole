import path from 'node:path';

import { buildCanonicalAttachmentStorageKey, parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

export function buildAttachmentStorageFileName(contentHash: string, mimeType: string) {
  const storageKey = buildCanonicalAttachmentStorageKey(contentHash, mimeType);
  if (!storageKey) throw new Error('attachment storage key cannot be canonicalized');
  return storageKey;
}

export function resolveAttachmentStorageKeyPath(assetsDir: string, storageKey: string) {
  if (!parseCanonicalAttachmentStorageKey(storageKey)) {
    throw new Error('attachment storage key is not canonical');
  }
  const resolvedAssetsDir = path.resolve(assetsDir);
  const resolvedPath = path.resolve(resolvedAssetsDir, storageKey);
  const relativePath = path.relative(resolvedAssetsDir, resolvedPath);

  if (relativePath.length === 0 || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('attachment storage path escapes assets directory');
  }

  return resolvedPath;
}

/** Only cleanup and versioned migration code may enumerate historical aliases. */
export function resolveAttachmentStoragePathCandidates(
  contentHash: string,
  mimeType: string,
  assetsDir: string
) {
  const canonical = resolveAttachmentStorageKeyPath(assetsDir, buildAttachmentStorageFileName(contentHash, mimeType));
  return [canonical, path.join(path.resolve(assetsDir), contentHash)];
}
