import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
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

async function readImage(root: string, source: string) {
  try {
    const decoded = /^file:/i.test(source) ? fileURLToPath(source) : decodeURIComponent(source);
    const reference = decoded.replaceAll('\\', '/');
    if (reference.startsWith('//') || (!path.isAbsolute(reference) && /^[a-z][a-z0-9+.-]*:/i.test(reference))) return null;
    const candidate = path.resolve(root, reference);
    if (!isSameOrNestedPath(candidate, root)) return null;
    const filename = await realpath(candidate);
    if (!isSameOrNestedPath(filename, root)) return null;
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

export async function prepareSuperMemoTopicContent(parts: string[], collectionDirectory?: string) {
  const draft = convertSuperMemoContent(parts);
  const root = collectionDirectory ? await assertAuthorizedImportDirectoryPath(collectionDirectory) : null;
  const destinations = new Map<string, string>();
  const references = new Map<string, NodeResourceReference>();
  if (root) for (const source of draft.localSources) {
    const image = await readImage(root, source);
    if (!image) continue;
    const canonical = prepareCanonicalImageAttachment(image.bytes);
    if (!canonical) continue;
    await stageManagedAttachmentFile({ ...image, mimeType: canonical.mimeType });
    destinations.set(source, buildAssetMarkdownUrl(canonical.storageKey));
    references.set(canonical.storageKey, {
      storage_key: canonical.storageKey, original_name: image.originalName, role: 'image'
    });
  }
  return {
    content: destinations.size ? convertSuperMemoContent(parts, destinations).content : draft.content,
    resourceReferences: [...references.values()],
    unresolvedImages: [...draft.localSources].filter(source => !destinations.has(source))
  };
}
