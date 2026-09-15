export const SYNC_FROM_ZERO_DATASET = Object.freeze({
  attachmentBytes: 512 * 1024,
  attachmentCount: 65,
  contentBodyBytes: 256 * 1024,
  nodeCount: 40,
  nodePrefix: 'sync-from-zero-a-'
});

export const WINDOWS_SYNC_FROM_ZERO_PROGRESS = Object.freeze([
  'c-cursor-zero',
  'c-group-discovered',
  'c-join-requested',
  'c-membership-active',
  'c-first-cursor-committed',
  'c-object-batches-received',
  'c-controlled-interruption',
  'c-restarted-from-cursor',
  'c-content-batches-received',
  'c-attachment-batches-received'
]);

export function syncFromZeroDatasetDigest({ attachmentIds, contentHashes, nodeIds }) {
  return createHash('sha256').update(JSON.stringify({
    attachmentIds: [...attachmentIds].sort(),
    contentHashes: [...contentHashes].sort(),
    nodeIds: [...nodeIds].sort()
  })).digest('hex');
}

export function assertSyncFromZeroDatasetFacts(facts, dataset = SYNC_FROM_ZERO_DATASET) {
  if (facts.datasetNodeCount !== dataset.nodeCount
      || facts.datasetContentBlobCount !== dataset.nodeCount
      || facts.datasetCachedContentBlobCount !== dataset.nodeCount
      || facts.datasetAttachmentCount !== dataset.attachmentCount
      || facts.datasetCachedAttachmentCount !== dataset.attachmentCount) {
    throw new Error(`Sync-from-zero dataset is incomplete: ${JSON.stringify(facts)}`);
  }
  return facts;
}

export function assertSyncFromZeroCursorContinuity(receipt) {
  const initial = receipt.initialFacts?.receiveCursor ?? 0;
  const committed = receipt.firstCommittedFacts?.receiveCursor ?? 0;
  const interrupted = receipt.interruptedFacts?.receiveCursor ?? 0;
  const restarted = receipt.restartedFacts?.receiveCursor ?? 0;
  const final = receipt.finalFacts?.receiveCursor ?? 0;
  if (initial !== 0 || committed <= 0 || interrupted !== committed
      || restarted < committed || final < restarted) {
    throw new Error(`Sync-from-zero cursor continuity is invalid: ${JSON.stringify({
      committed, final, initial, interrupted, restarted
    })}`);
  }
  return receipt;
}
import { createHash } from 'node:crypto';
