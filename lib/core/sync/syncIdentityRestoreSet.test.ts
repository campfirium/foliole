// @vitest-environment node
import { expect, it } from 'vitest';

import { createSyncIdentityDigest } from './syncIdentityDigest.js';
import { buildSyncIdentityRestoreSet,
  parseSyncIdentityRestoreSet } from './syncIdentityRestoreSet.js';

const base = {
  restore_id: 'restore-1', group_id: 'group', source_peer_id: 'source',
  target_peer_id: 'target', source_view_id: '12345678-1234-1234-1234-123456789abc',
  source_epoch: 'a'.repeat(32), fact_proof_root: 'b'.repeat(64),
  fact_data_root: 'd'.repeat(64),
  inventory: { row_count: 0, digest: createSyncIdentityDigest().finish() }
};

it('binds an explicit empty restore collection to its event and fixed view', () => {
  const set = buildSyncIdentityRestoreSet(base);
  expect(set.object_count).toBe(0);
  expect(parseSyncIdentityRestoreSet(set)).toEqual(set);
  expect(buildSyncIdentityRestoreSet({ ...base, restore_id: 'restore-2' }).set_id)
    .not.toBe(set.set_id);
  expect(buildSyncIdentityRestoreSet({ ...base,
    source_view_id: '12345678-1234-1234-1234-123456789abd' }).set_id)
    .not.toBe(set.set_id);
  expect(buildSyncIdentityRestoreSet({ ...base,
    fact_proof_root: 'c'.repeat(64) }).set_id).not.toBe(set.set_id);
  expect(buildSyncIdentityRestoreSet({ ...base,
    fact_data_root: 'c'.repeat(64) }).set_id).not.toBe(set.set_id);
});

it('binds a restore-published source epoch without rewriting it', () => {
  const epoch = 'restore-90a8dd81-884c-45bb-9b8e-8a7ebe57f8ce';
  const set = buildSyncIdentityRestoreSet({ ...base, source_epoch: epoch });
  expect(parseSyncIdentityRestoreSet(set).source_epoch).toBe(epoch);
  expect(set.set_id).not.toBe(buildSyncIdentityRestoreSet(base).set_id);
});

it('rejects a forged count, inventory, revision, or extra field', () => {
  const set = buildSyncIdentityRestoreSet(base);
  for (const changed of [
    { ...set, object_count: 1 },
    { ...set, inventory: { ...set.inventory, row_count: 1 } },
    { ...set, fact_proof_revision: 'older' },
    { ...set, extra: true }
  ]) expect(() => parseSyncIdentityRestoreSet(changed))
    .toThrow('sync_identity_restore_set_invalid');
});
