import fs from 'node:fs';

import { expect, it } from 'vitest';

import { SYNC_OBJECT_APPLY_BATCH_SIZE } from '../../lib/core/sync/syncObjectApplyExecutor.ts';
import { ATTACHMENT_RESOURCE_BATCH_LIMIT } from '../../src/shared/platform/companionDesktopSyncResources.ts';
import { CONTENT_BLOB_BATCH_LIMIT } from '../../src/shared/platform/companionDesktopSyncContentBlobs.ts';
import {
  assertSyncFromZeroCursorContinuity, assertSyncFromZeroDatasetFacts,
  SYNC_FROM_ZERO_DATASET
} from './sync-from-zero-contract.mjs';

it('keeps the bounded product dataset beyond every existing ordinary sync batch boundary', () => {
  expect(SYNC_FROM_ZERO_DATASET.nodeCount).toBeGreaterThan(SYNC_OBJECT_APPLY_BATCH_SIZE);
  expect(SYNC_FROM_ZERO_DATASET.nodeCount).toBeGreaterThan(CONTENT_BLOB_BATCH_LIMIT);
  expect(SYNC_FROM_ZERO_DATASET.attachmentCount).toBeGreaterThan(ATTACHMENT_RESOURCE_BATCH_LIMIT);
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

it('accepts only cursor zero followed by committed, restart-stable forward progress', () => {
  const receipt = { finalFacts: { receiveCursor: 90 }, firstCommittedFacts: { receiveCursor: 80 },
    initialFacts: { receiveCursor: 0 }, interruptedFacts: { receiveCursor: 80 },
    restartedFacts: { receiveCursor: 80 } };
  expect(assertSyncFromZeroCursorContinuity(receipt)).toBe(receipt);
  expect(() => assertSyncFromZeroCursorContinuity({
    ...receipt, restartedFacts: { receiveCursor: 0 }
  })).toThrow('cursor continuity is invalid');
});

it('reads the desktop receive cursor from the stable state stream', () => {
  const inspector = fs.readFileSync(
    'scripts/windows/windows-sync-group-recovery-inspect.mjs', 'utf8'
  );
  expect(inspector).toContain("stream_name === 'state'");
});
