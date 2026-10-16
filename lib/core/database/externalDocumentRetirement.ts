import { buildCanonicalSyncTombstone } from '../sync/canonicalSyncTombstone.js';

import type { DatabaseDriver } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export function retireExternalDocument(driver: DatabaseDriver, input: {
  documentId: string; deletedAt: string; hostName: string;
}) {
  return driver.transaction(tx => {
    const row = tx.queryOne<{ is_present: number }>(
      'SELECT is_present FROM external_documents WHERE document_id = ?', [input.documentId]);
    if (!row || row.is_present === 0) return false;
    tx.execute(`UPDATE external_documents SET is_present = 0, missing_at = ?, updated_at = ?
      WHERE document_id = ?`, [input.deletedAt, input.deletedAt, input.documentId]);
    upsertSyncObjectState(tx, {
      objectType: 'external_document', objectId: input.documentId,
      contentHash: computeSyncContentHash('external_document', buildCanonicalSyncTombstone(input.documentId)),
      deletedAt: input.deletedAt, updatedAt: input.deletedAt, lastModifiedByHostName: input.hostName, syncDirty: true
    });
    return true;
  });
}
