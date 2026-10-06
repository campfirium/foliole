import { z } from 'zod';

import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

const retiredDocuments = z.array(z.object({ document_id: z.string(), deleted_at: z.string(),
  last_modified_by_host_name: z.string(), updated_at: z.string() }));

export function migrateRetiredExternalDocuments(sqlite: DatabaseMigrationTarget) {
  const documents = retiredDocuments.parse(sqlite.prepare(`SELECT document.object_id AS document_id,
      folder.deleted_at, folder.updated_at, folder.last_modified_by_host_name
    FROM sync_object_state document JOIN sync_object_state folder
      ON folder.object_type = 'external_folder' AND folder.deleted_at IS NOT NULL
      AND substr(document.object_id, 1, length(folder.object_id) + 1) = folder.object_id || ':'
    WHERE document.object_type = 'external_document' AND document.deleted_at IS NULL
      AND document.updated_at <= folder.updated_at
      AND length(document.object_id) > length(folder.object_id) + 1
      AND NOT EXISTS (SELECT 1 FROM sync_object_state other_folder
        WHERE other_folder.object_type = 'external_folder' AND other_folder.object_id <> folder.object_id
          AND substr(document.object_id, 1, length(other_folder.object_id) + 1) = other_folder.object_id || ':')
      AND NOT EXISTS (SELECT 1 FROM external_documents materialized
        WHERE materialized.document_id = document.object_id)
      AND NOT EXISTS (SELECT 1 FROM external_search_folders materialized
        WHERE materialized.id = folder.object_id)`).all());
  for (const document of documents) {
    sqlite.prepare(`UPDATE sync_object_state SET
        base_content_hash = CASE WHEN sync_dirty = 1 THEN COALESCE(base_content_hash, content_hash)
          ELSE content_hash END,
        content_hash = ?, state_seq = ${NEXT_SYNC_STATE_SEQ_SQL}, sync_dirty = 1,
        updated_at = ?, deleted_at = ?, last_modified_by_host_name = ?
      WHERE object_type = 'external_document' AND object_id = ? AND deleted_at IS NULL`).run(
      computeSyncContentHash('external_document', buildCanonicalSyncTombstone(document.document_id)),
      document.updated_at, document.deleted_at, document.last_modified_by_host_name, document.document_id
    );
  }
}
