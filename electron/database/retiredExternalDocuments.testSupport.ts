import type Database from 'better-sqlite3';

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';

export const folderDeletedAt = '2026-07-24T00:23:10.000Z';

export function seedRetiredExternalDocuments(sqlite: Database.Database, count = 2) {
  const insert = sqlite.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
      updated_at, deleted_at, sync_dirty, base_content_hash)
    VALUES (?, ?, (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1),
      ?, 'Original host', ?, ?, 1, 'original-base')`);
  insert.run('external_folder', 'retired-folder', computeSyncContentHash('external_folder',
    buildCanonicalSyncTombstone('retired-folder')), folderDeletedAt, folderDeletedAt);
  for (let index = 0; index < count; index++) insert.run('external_document',
    `retired-folder:document-${index}.md`, computeSyncContentHash('external_document', { legacy: index }),
    '2026-07-01T00:00:00.000Z', null);
  sqlite.pragma('user_version = 142');
}
