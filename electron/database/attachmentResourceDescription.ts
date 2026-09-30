import { createHash } from 'node:crypto';

import type { AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { openDatabaseConnection, resolveDatabasePath } from './connection.js';

export function currentLibraryScope() {
  return createHash('sha256').update(resolveDatabasePath()).digest('hex');
}

export function loadAttachmentResourceDescription(attachmentId: string): AttachmentResourceDescription | null {
  const identity = loadAttachmentResourceStorageIdentity(attachmentId);
  if (!identity) return null;
  return { ...identity,
    availability: resolveAttachmentFile(identity.storageKey).status === 'ready' ? 'local' : 'missing',
    libraryScope: currentLibraryScope() };
}

export function loadAttachmentResourceStorageIdentity(attachmentId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string; mime_type: string }>(
    'SELECT id, mime_type FROM attachments WHERE id = ?', [attachmentId]
  );
  const storageKey = row?.mime_type ? buildCanonicalAttachmentStorageKey(row.id, row.mime_type) : null;
  if (!row || !storageKey) return null;
  return {
    attachmentId: row.id, contentHash: row.id,
    mimeType: row.mime_type as AttachmentResourceDescription['mimeType'], storageKey
  };
}
