import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { compactDeletedVersionSnapshot } from '../database/deletedNodeBodyRelease.js';

import type { DbPort } from './dbPort.js';
import type { SyncNodeRecordMetadata, SyncNodeRecordSource } from './syncNodeRecordSource.js';

export function canCompactIncomingHistory(record: SyncNodeRecordMetadata) {
  return !record.is_tombstone && record.snapshot.body_deleted === true && !record.snapshot.deleted_version_metadata_digest;
}

/** Brand-new identity-only history can be compacted in the same transaction as its deletion. */
export async function canStageFreshDeletionHistory<M extends SyncNodeRecordMetadata>(
  tx: DbPort, records: readonly M[], history: readonly M[], source: SyncNodeRecordSource<M>,
  isNew: (record: M) => boolean
) {
  const head = records[0];
  if (records.length !== 1 || !head?.is_tombstone || !head.version_id || !head.host_name ||
      !head.content_hash || !head.snapshot.deleted_at || !history.some(canCompactIncomingHistory) ||
      !history.every(record => record.object_id === head.object_id && source.isIdentityOnly(record) && isNew(record))) return false;
  const [existing] = await tx.query('SELECT 1 FROM nodes WHERE id = ? ' +
    'UNION ALL SELECT 1 FROM node_sync_tombstones WHERE node_id = ? LIMIT 1', [head.object_id, head.object_id]);
  return !existing;
}

export function prepareCompressedHistory(record: NativeSyncNodeRecord, hashes: Set<string>) {
  if (record.body_text !== null || record.snapshot.content !== null || record.alternative_bodies?.length) {
    throw new Error('request_sync_deleted_history_body_unexpected');
  }
  for (const alternative of record.snapshot.text_alternatives ?? []) hashes.add(alternative.body_blob_hash);
  if (record.snapshot.body_blob_hash) hashes.add(record.snapshot.body_blob_hash);
  return compactDeletedVersionSnapshot(record.snapshot);
}
