import {
  buildCanonicalExternalDocumentPayload,
  buildCanonicalExternalFolderPayload
} from '../sync/canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

interface StateRow {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: 'external_document' | 'external_folder';
}

export function migrateExternalResourceCanonicalHashes(sqlite: DatabaseMigrationTarget) {
  const states = sqlite.prepare(
    `SELECT object_type, object_id, content_hash, deleted_at FROM sync_object_state
     WHERE object_type IN ('external_document', 'external_folder')`
  ).all() as StateRow[];
  for (const state of states) {
    const payload = state.deleted_at
      ? buildCanonicalSyncTombstone(state.object_id)
      : state.object_type === 'external_document'
        ? readDocumentPayload(sqlite, state.object_id)
        : readFolderPayload(sqlite, state.object_id);
    if (!payload) continue;
    publishChangedHash(sqlite, state, computeSyncContentHash(state.object_type, payload));
  }
}

function readDocumentPayload(sqlite: DatabaseMigrationTarget, objectId: string) {
  const row = sqlite.prepare(
    `SELECT document_id, folder_id, relative_path, file_name, extension, content_hash, title,
       body_blob_hash, reference_kind, reference_json FROM external_documents WHERE document_id = ?`
  ).all(objectId)[0] as Parameters<typeof buildCanonicalExternalDocumentPayload>[0] | undefined;
  return row ? buildCanonicalExternalDocumentPayload(row) : null;
}

function readFolderPayload(sqlite: DatabaseMigrationTarget, objectId: string) {
  const row = sqlite.prepare(
    `SELECT folder.id, folder.source_ref, source.host_name, source.host_platform,
       folder.attachment_mode, folder.excluded_dirs_json
     FROM external_search_folders folder
     JOIN desktop_sources source ON source.source_ref = folder.source_ref WHERE folder.id = ?`
  ).all(objectId)[0] as Parameters<typeof buildCanonicalExternalFolderPayload>[0] | undefined;
  return row ? buildCanonicalExternalFolderPayload(row) : null;
}

function publishChangedHash(sqlite: DatabaseMigrationTarget, state: StateRow, hash: string) {
  sqlite.prepare(
    `UPDATE sync_object_state SET
       base_content_hash = CASE WHEN sync_dirty = 1 THEN COALESCE(base_content_hash, content_hash)
                                ELSE content_hash END,
       content_hash = ?, state_seq = ${NEXT_SYNC_STATE_SEQ_SQL}, sync_dirty = 1
     WHERE object_type = ? AND object_id = ? AND content_hash IS NOT ?`
  ).run(hash, state.object_type, state.object_id, hash);
}
