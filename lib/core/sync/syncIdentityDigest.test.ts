import { expect, it } from 'vitest';

import {
  syncIdentityFingerprint, syncIdentityPartition, syncIdentityPartitionDigest
} from './syncIdentityDigest.js';

it('uses the same identity partition for a node regardless of its local sequence', () => {
  const identity = syncIdentityPartition('node', 'shared-id');
  expect(identity).toBeGreaterThanOrEqual(0);
  expect(identity).toBeLessThan(256);
  expect(syncIdentityPartition('node', 'shared-id')).toBe(identity);
  expect(syncIdentityPartition('node_review', 'shared-id')).not.toBe(identity);
});

it('distinguishes current state while excluding local clocks and transport markers', () => {
  const state = { object_type: 'node', object_id: 'shared-id', content_hash: 'body',
    current_version_id: 'version-a', deleted_at: null };
  const fingerprint = syncIdentityFingerprint(state);
  expect(syncIdentityFingerprint({ ...state, updated_at: 'later', state_seq: 900 } as
    typeof state)).toBe(fingerprint);
  expect(syncIdentityFingerprint({ ...state, current_version_id: 'version-b' })).not.toBe(fingerprint);
  expect(syncIdentityFingerprint({ ...state, deleted_at: '2026-10-03' })).not.toBe(fingerprint);
});

it('hashes an ordered partition without ambiguous identity boundaries', () => {
  const first = { object_type: 'node', object_id: 'a:b', fingerprint: 'c' };
  const second = { object_type: 'node', object_id: 'a', fingerprint: 'b:c' };
  expect(syncIdentityPartitionDigest([second, first])).not.toBe(
    syncIdentityPartitionDigest([{ ...second, fingerprint: 'b' },
      { ...first, fingerprint: 'c:c' }]));
  expect(() => syncIdentityPartitionDigest([first, second])).toThrow('sync_identity_partition_order_invalid');
});
