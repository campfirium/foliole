import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { computeSyncContentHash } from './syncState.js';
import { NEXT_SYNC_STATE_SEQ_SQL } from './syncStateSequenceSchemaStatements.js';

const CHILD_DOCUMENTS_SQL = `SELECT document.document_id FROM external_documents document
  LEFT JOIN sync_object_state state ON state.object_type = 'external_document'
    AND state.object_id = document.document_id
  WHERE document.folder_id = ? AND state.deleted_at IS NULL`;

const RETIRE_DOCUMENT_SQL = `INSERT INTO sync_object_state
  (object_type, object_id, state_seq, content_hash, last_modified_by_host_name,
   updated_at, deleted_at, sync_dirty)
  VALUES ('external_document', ?, ${NEXT_SYNC_STATE_SEQ_SQL}, ?, ?, ?, ?, 1)
  ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq,
    content_hash = excluded.content_hash, last_modified_by_host_name = excluded.last_modified_by_host_name,
    updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`;

type Removal = { folderId: string; deletedAt: string; hostName: string };

function retirementParams(documentId: string, removal: Removal) {
  return [documentId, computeSyncContentHash('external_document', buildCanonicalSyncTombstone(documentId)),
    removal.hostName, removal.deletedAt, removal.deletedAt];
}

// Call within the same transaction as the folder deletion, before removing its projection.
export function retireExternalFolderDocuments(driver: DatabaseDriver, removal: Removal) {
  for (const row of driver.queryAll<{ document_id: string }>(CHILD_DOCUMENTS_SQL, [removal.folderId])) {
    driver.execute(RETIRE_DOCUMENT_SQL, retirementParams(row.document_id, removal));
  }
}

export async function retireExternalFolderDocumentsWithDbPort(port: DbPort, removal: Removal) {
  for (const row of await port.query<{ document_id: string }>(CHILD_DOCUMENTS_SQL, [removal.folderId])) {
    await port.run(RETIRE_DOCUMENT_SQL, retirementParams(row.document_id, removal));
  }
}
