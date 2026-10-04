import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { syncIdentityFingerprint } from '../../lib/core/sync/syncIdentityDigest.js';
import { isSyncPackStateObjectType } from '../../lib/core/sync/syncPackManifest.js';

import {
  loadPackRowsForStateRows, SYNC_PACK_PRESENT_STATE_PREDICATE,
  type SyncStatePackRow
} from './syncPackRows.js';

export interface SyncPackIdentity {
  object_type: string;
  object_id: string;
  fingerprint: string;
}

/** Reads one bounded candidate page from a fixed source view. */
export function loadPackRowsByIdentity(driver: DatabaseDriver, identities: readonly SyncPackIdentity[],
  stagedReviewNodeIds: readonly string[] = []) {
  if (identities.length > 128 || identities.some((identity) =>
    !isSyncPackStateObjectType(identity.object_type) || !identity.object_id ||
    !/^[a-f0-9]{64}$/u.test(identity.fingerprint))) {
    throw new Error('sync_pack_identity_page_invalid');
  }
  const keys = new Set(identities.map((identity) => `${identity.object_type}\0${identity.object_id}`));
  if (keys.size !== identities.length) throw new Error('sync_pack_identity_page_duplicate');
  const rows = identities.length === 0 ? [] : driver.queryAll<SyncStatePackRow>(
    `WITH selected AS (
       SELECT json_extract(value, '$.object_type') AS object_type,
         json_extract(value, '$.object_id') AS object_id FROM json_each(?)
     )
     SELECT sync_object_state.object_type, sync_object_state.object_id, state_seq,
       current_version_id, content_hash, last_modified_by_host_name, updated_at, deleted_at
     FROM sync_object_state
     WHERE (object_type, object_id) IN (SELECT object_type, object_id FROM selected)
       AND ${SYNC_PACK_PRESENT_STATE_PREDICATE}
     ORDER BY sync_object_state.object_type, sync_object_state.object_id`,
    [JSON.stringify(identities)]
  );
  if (rows.length !== identities.length) throw new Error('sync_pack_identity_source_changed');
  const expected = new Map(identities.map((identity) => [
    `${identity.object_type}\0${identity.object_id}`, identity.fingerprint
  ]));
  if (rows.some((row) => syncIdentityFingerprint(row) !== expected.get(
    `${row.object_type}\0${row.object_id}`))) {
    throw new Error('sync_pack_identity_source_changed');
  }
  const { consumedStateSeq: _localSequence, ...packRows } =
    loadPackRowsForStateRows(driver, rows, 0, stagedReviewNodeIds);
  if (_localSequence !== 0) throw new Error('sync_pack_identity_local_sequence_leaked');
  return packRows;
}
