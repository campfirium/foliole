import { constants } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { convertSuperMemoContent } from '../../lib/core/import/superMemoContent.js';
import { buildAssetMarkdownUrl } from '../../lib/platform/assetMarkdownUrl.js';
import { prepareCanonicalImageAttachment } from '../attachments/importImageAttachmentBytes.js';
import { stageManagedAttachmentFile } from '../attachments/managedAttachmentFileStage.js';
import { assertAuthorizedImportDirectoryPath } from '../ipc/importPathAuthorization.js';
import { isSameOrNestedPath } from '../libraryPathSafety.js';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

async function imageCandidate(root: string, source: string) {
  const primary = /^file:\/\/\/\[PrimaryStorage\](.*)$/i.exec(source)?.[1];
  if (primary === undefined) {
    const decoded = /^file:/i.test(source) ? fileURLToPath(source) : decodeURIComponent(source);
    const reference = decoded.replaceAll('\\', '/');
    if (reference.startsWith('//') || (!path.isAbsolute(reference) && /^[a-z][a-z0-9+.-]*:/i.test(reference))) return null;
    return { path: path.resolve(root, reference), boundary: root };
  }
  const parts = decodeURIComponent(primary).replaceAll('\\', '/').replace(/^\//, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes(':'))) return null;
  const storage = await realpath(path.join(root, 'elements'));
  if (!isSameOrNestedPath(storage, root)) return null;
  const name = parts.pop()!;
  const directory = await realpath(path.join(storage, ...parts));
  if (!isSameOrNestedPath(directory, storage)) return null;
  const names = await readdir(directory);
  const stem = path.basename(name, path.extname(name));
  const extension = path.extname(name).toLowerCase();
  const matches = names.filter(entry => path.basename(entry, path.extname(entry)) === stem
    && path.extname(entry).toLowerCase() === extension);
  if (names.includes(name)) return { path: path.join(directory, name), boundary: storage };
  return matches.length === 1 ? { path: path.join(directory, matches[0]!), boundary: storage } : null;
}

async function readImage(root: string, source: string) {
  try {
    const candidate = await imageCandidate(root, source);
    if (!candidate || !isSameOrNestedPath(candidate.path, candidate.boundary)) return null;
    const filename = await realpath(candidate.path);
    if (!isSameOrNestedPath(filename, candidate.boundary)) return null;
    const file = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) return null;
      const bytes = Buffer.alloc(stat.size);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      return bytesRead === bytes.length ? { bytes, originalName: path.basename(filename) } : null;
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}

async function readImportableImage(root: string, source: string) {
  const image = await readImage(root, source);
  if (!image) return null;
  const canonical = prepareCanonicalImageAttachment(image.bytes);
  return canonical ? { image, canonical } : null;
}

export async function inspectSuperMemoImageSources(sources: ReadonlySet<string>, directory?: string) {
  const root = directory ? await assertAuthorizedImportDirectoryPath(directory) : null;
  const images = new Map<string, string | null>();
  for (const source of sources) {
    const resolved = root ? await readImportableImage(root, source) : null;
    images.set(source, resolved?.canonical.storageKey ?? null);
  }
  return images;
}

export async function prepareSuperMemoTopicContent(parts: string[], collectionDirectory?: string, expectedImages?: ReadonlyMap<string, string | null>) {
  const draft = convertSuperMemoContent(parts);
  const root = collectionDirectory ? await assertAuthorizedImportDirectoryPath(collectionDirectory) : null;
  const destinations = new Map<string, string>();
  const references = new Map<string, NodeResourceReference>();
  if (root) for (const source of draft.localSources.keys()) {
    const resolved = await readImportableImage(root, source);
    if (expectedImages && expectedImages.get(source) !== (resolved?.canonical.storageKey ?? null)) {
      throw new Error('supermemo_preview_changed');
    }
    if (!resolved) continue;
    const { image, canonical } = resolved;
    await stageManagedAttachmentFile({ ...image, mimeType: canonical.mimeType });
    destinations.set(source, buildAssetMarkdownUrl(canonical.storageKey));
    references.set(canonical.storageKey, {
      storage_key: canonical.storageKey, original_name: image.originalName, role: 'image'
    });
  }
  return {
    content: destinations.size ? convertSuperMemoContent(parts, destinations).content : draft.content,
    resourceReferences: [...references.values()],
    unresolvedImages: [...draft.localSources].flatMap(([source, count]) =>
      destinations.has(source) ? [] : Array<string>(count).fill(source))
  };
}
