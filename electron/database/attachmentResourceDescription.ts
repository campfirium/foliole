import { createHash } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { AttachmentAvailability, AttachmentResourceDescription } from '../../lib/platform/attachmentResource.js';
import { isCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

import { openDatabaseConnection, resolveDatabasePath } from './connection.js';

interface AttachmentResourceRow extends DatabaseRow {
  attachment_id: string;
  availability: string;
  content_hash: string | null;
  mime_type: string | null;
  storage_key: string | null;
}

function normalizeAvailability(value: string): AttachmentAvailability {
  if (value === 'cached' || value === 'local' || value === 'missing' ||
      value === 'remote_known' || value === 'unresolved') return value;
  return 'missing';
}

export function currentLibraryScope() {
  return createHash('sha256').update(resolveDatabasePath()).digest('hex');
}

export function loadAttachmentResourceDescription(attachmentId: string): AttachmentResourceDescription | null {
  const row = openDatabaseConnection().driver.queryOne<AttachmentResourceRow>(
    `SELECT attachment_id, availability, content_hash, mime_type, storage_key
     FROM attachment_blobs WHERE attachment_id = ?`,
    [attachmentId]
  );
  if (!row?.content_hash || !row.mime_type || !row.storage_key ||
      !isCanonicalAttachmentStorageKey(row.storage_key, row.content_hash, row.mime_type)) return null;
  return {
    attachmentId: row.attachment_id,
    availability: normalizeAvailability(row.availability),
    contentHash: row.content_hash,
    libraryScope: currentLibraryScope(),
    mimeType: row.mime_type as AttachmentResourceDescription['mimeType'],
    storageKey: row.storage_key
  };
}
