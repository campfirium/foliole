import { createHash } from 'node:crypto';

import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { resolveDatabasePath } from './connection.js';

export function currentLibraryScope() {
  return createHash('sha256').update(resolveDatabasePath()).digest('hex');
}

export function loadAttachmentResourceDescription(storageKey: string): AttachmentResourceDescription | null {
  const identity = loadAttachmentResourceStorageIdentity(storageKey);
  if (!identity) return null;
  return { ...identity,
    availability: resolveAttachmentFile(identity.storageKey).status === 'ready' ? 'local' : 'missing',
    libraryScope: currentLibraryScope() };
}

export function loadAttachmentResourceStorageIdentity(storageKey: string) {
  const identity = parseCanonicalAttachmentStorageKey(storageKey);
  return identity ? { attachmentId: identity.contentHash, contentHash: identity.contentHash,
    mimeType: identity.mimeType, storageKey } : null;
}
