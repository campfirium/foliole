import { createHash } from 'node:crypto';

import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { resolveDatabasePath } from './connection.js';

export function currentLibraryScope() {
  return libraryScopeForDatabasePath(resolveDatabasePath());
}

export function libraryScopeForDatabasePath(databasePath: string) {
  return createHash('sha256').update(databasePath).digest('hex');
}

export async function loadAttachmentResourceDescription(storageKey: string): Promise<AttachmentResourceDescription | null> {
  const identity = loadAttachmentResourceStorageIdentity(storageKey);
  if (!identity) return null;
  const libraryScope = currentLibraryScope();
  return { ...identity,
    availability: (await resolveAttachmentFile(identity.storageKey)).status === 'ready' ? 'local' : 'missing',
    libraryScope };
}

export function loadAttachmentResourceStorageIdentity(storageKey: string) {
  const identity = parseCanonicalAttachmentStorageKey(storageKey);
  return identity ? { attachmentId: identity.contentHash, contentHash: identity.contentHash,
    mimeType: identity.mimeType, storageKey } : null;
}
