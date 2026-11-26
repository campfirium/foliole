import { expect, it } from 'vitest';

import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { runRequestSyncDatabaseRound } from './requestSyncDatabaseRound.js';

const entry = (globalId: string): FramedSyncInventoryEntry => ({ globalId, objectType: 'node',
  frontierFactIds: [`${globalId}-v1`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
  sharedStateHash: new Uint8Array(32).fill(1) });

function round(failure: string) {
  const remote: FramedSyncInventoryEntry[] = [];
  const errors: string[] = [];
  const result = runRequestSyncDatabaseRound({
    exchangeInventory: async () => ({ local: [entry('bad'), entry('good')], remote: [...remote] }),
    transferObjects: async differences => differences.map(difference => {
      if (difference.globalId !== 'bad') remote.push(difference.sourceSnapshot);
      return { requestId: new Uint8Array(16), objectType: difference.objectType, globalId: difference.globalId,
        error: difference.globalId === 'bad' ? failure : '' };
    }),
    reportObjectError: difference => { errors.push(difference.globalId); }
  });
  return { result, errors, remote };
}

it.each(['node_version_body_unavailable', 'request_sync_version_missing:v1', 'invalid node_reading state',
  'sync_content_hash_mismatch:node_reading', 'request_sync_body_identity_mismatch',
  'framed_sync_http_400:node_version_compact_without_deletion', 'an_error_nobody_listed'])(
  'keeps syncing the other objects when one fails with %s', async failure => {
    const run = round(failure);
    expect(await run.result).toMatchObject({ complete: false, pending: 1, transferred: 1, onlyRejectedObjectsPending: true });
    expect(run.remote.map(value => value.globalId)).toEqual(['good']);
    expect(run.errors).toEqual(['bad']);
  });

it.each(['database or disk is full', 'disk I/O error (code 10 SQLITE_IOERR)', 'database disk image is malformed',
  'database is locked', 'request_sync_object_savepoint_failed', 'request_sync_peer_inactive',
  'framed_sync_http_400:request_sync_peer_context_mismatch', 'sync_group_overwrite_source_changed',
  'framed_sync_preamble_invalid', 'request_cancelled'])('still stops the round on %s', async failure => {
  const run = round(failure);
  await expect(run.result).rejects.toThrow(failure);
  expect(run.errors).toEqual([]);
});
