import fs from 'node:fs';

import { expect, it } from 'vitest';

import { SYNC_OBJECT_APPLY_BATCH_SIZE } from '../../lib/core/sync/syncObjectApplyExecutor.ts';
import {
  assertSyncFromZeroCommittedFacts, assertSyncFromZeroDatasetFacts,
  SYNC_FROM_ZERO_DATASET
} from './sync-from-zero-contract.mjs';

it('keeps the bounded product dataset beyond every existing ordinary sync batch boundary', () => {
  expect(SYNC_FROM_ZERO_DATASET.nodeCount).toBeGreaterThan(SYNC_OBJECT_APPLY_BATCH_SIZE);
});

it('requires exact dataset resources instead of accepting generic nonempty facts', () => {
  const complete = {
    datasetAttachmentCount: 65, datasetCachedAttachmentCount: 65,
    datasetCachedContentBlobCount: 40, datasetContentBlobCount: 40, datasetNodeCount: 40
  };
  expect(assertSyncFromZeroDatasetFacts(complete)).toBe(complete);
  expect(() => assertSyncFromZeroDatasetFacts({ ...complete, datasetCachedAttachmentCount: 64 }))
    .toThrow('dataset is incomplete');
});

it('retains committed IDs and hashes after interruption, restart and completion', () => {
  const committed = { datasetNodeCount: 1, datasetNodeIds: ['one'], datasetContentHashes: ['hash'] };
  const receipt = { finalFacts: { datasetNodeIds: ['one', 'two'], datasetContentHashes: ['hash', 'second'] },
    firstCommittedFacts: committed, initialFacts: { datasetNodeCount: 0 },
    interruptedFacts: committed, restartedFacts: committed };
  expect(assertSyncFromZeroCommittedFacts(receipt)).toBe(receipt);
  for (const restartedFacts of [{ datasetNodeIds: [], datasetContentHashes: [] },
    { datasetNodeIds: ['one'], datasetContentHashes: ['changed'] }]) {
    expect(() => assertSyncFromZeroCommittedFacts({ ...receipt, restartedFacts }))
      .toThrow('committed dataset facts changed');
  }
});

it('rejects empty or already complete data as the controlled partial commit', () => {
  for (const count of [0, 40]) {
    const committed = { datasetNodeCount: count,
      datasetNodeIds: Array.from({ length: count }, (_, index) => `node-${index}`),
      datasetContentHashes: Array.from({ length: count }, (_, index) => `hash-${index}`) };
    expect(() => assertSyncFromZeroCommittedFacts({ firstCommittedFacts: committed,
      initialFacts: { datasetNodeCount: 0 }, interruptedFacts: committed, restartedFacts: committed }))
      .toThrow('committed dataset evidence is incomplete');
  }
});

it('does not read retired cursor tables to inspect the dataset', () => {
  for (const file of ['scripts/windows/windows-sync-group-recovery-inspect.mjs',
    'scripts/sync-group/multi-device-sync-from-zero-evidence.mjs']) {
    expect(fs.readFileSync(file, 'utf8')).not.toContain('FROM sync_peer_cursors');
  }
});
