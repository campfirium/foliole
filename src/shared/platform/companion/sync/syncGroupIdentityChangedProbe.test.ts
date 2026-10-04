// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { emptySyncIdentitySummary } from '../../../../../lib/core/sync/syncIdentityDiff.js';
import { syncIdentityPartition,
  syncIdentityPartitionDigest } from '../../../../../lib/core/sync/syncIdentityDigest.js';

const runtime = vi.hoisted(() => ({
  keys: [] as Array<{ object_id: string; partition: number }>,
  candidates: [] as Array<{ object_id: string }>,
  changedId: '', remoteRows: [] as Array<{ object_type: string; object_id: string;
    fingerprint: string }>
}));
vi.mock('./syncGroupIdentityCandidateStore', () => ({
  initializeCompanionIdentityChangedKeys: async () => {},
  stageCompanionIdentityChangedKeys: async (_path: string,
    rows: typeof runtime.keys) => { runtime.keys.push(...rows); },
  readCompanionIdentityChangedPartitions: async () => runtime.keys.map((row) => ({
    partition: row.partition })),
  stageCompanionIdentityChangedCandidates: async (_path: string,
    rows: typeof runtime.candidates) => { runtime.candidates.push(...rows); }
}));
vi.mock('./syncGroupIdentityLocalRead', () => ({
  readCompanionLocalIdentitySource: async (_path: string, kind: string) => kind === 'changed_page'
    ? { entries: [], nextAfter: null } : { entries: [], nextAfter: null }
}));
vi.mock('./syncGroupIdentityRemoteRead', () => ({
  readCompanionRemoteChangedPage: async () => ({ entries: [{ object_type: 'node',
    object_id: runtime.changedId, updated_at: '2026-01-01T00:00:00.000Z' }], nextAfter: null }),
  readCompanionRemoteIdentityPage: async (_url: string, _view: string, partition: number) => ({
    entries: runtime.remoteRows.filter((row) =>
      syncIdentityPartition(row.object_type, row.object_id) === partition), nextAfter: null })
}));

import { stageCompanionIdentityChangedProbe } from './syncGroupIdentityChangedProbe.js';

it('stages only changed IDs while leaving older differences for the full fallback', async () => {
  runtime.keys = [];
  runtime.candidates = [];
  const changed = { object_type: 'node', object_id: 'changed', fingerprint: 'a'.repeat(64) };
  let older = { object_type: 'node', object_id: 'older', fingerprint: 'b'.repeat(64) };
  while (syncIdentityPartition(older.object_type, older.object_id) ===
    syncIdentityPartition(changed.object_type, changed.object_id)) {
    older = { ...older, object_id: `${older.object_id}-more` };
  }
  runtime.changedId = changed.object_id;
  runtime.remoteRows = [changed, older];
  const localSummary = emptySyncIdentitySummary();
  const peerSummary = emptySyncIdentitySummary();
  for (const row of runtime.remoteRows) {
    const partition = syncIdentityPartition(row.object_type, row.object_id);
    peerSummary[partition] = { partition, row_count: 1,
      digest: syncIdentityPartitionDigest([row]) };
  }
  await stageCompanionIdentityChangedProbe({ endpointUrl: 'http://peer',
    snapshotPath: '/snapshot', peerViewId: 'view', peerSummary, localSummary,
    localWatermark: 'old-local', peerWatermark: 'old-peer' });
  expect(runtime.keys.map((row) => row.object_id)).toEqual(['changed']);
  expect(runtime.candidates.map((row) => row.object_id)).toEqual(['changed']);
});
