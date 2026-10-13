export const SYNC_FROM_ZERO_DATASET = Object.freeze({
  attachmentBytes: 512 * 1024,
  attachmentCount: 65,
  contentBodyBytes: 256 * 1024,
  nodeCount: 40,
  nodePrefix: 'sync-from-zero-a-'
});

export const WINDOWS_SYNC_FROM_ZERO_PROGRESS = Object.freeze([
  'c-dataset-empty',
  'c-group-discovered',
  'c-join-requested',
  'c-membership-active',
  'c-first-object-committed',
  'c-object-batches-received',
  'c-controlled-interruption',
  'c-restarted-with-committed-objects',
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

export function assertSyncFromZeroCommittedFacts(receipt) {
  const committed = receipt.firstCommittedFacts;
  const ids = committed?.datasetNodeIds;
  const hashes = committed?.datasetContentHashes;
  if (receipt.initialFacts?.datasetNodeCount !== 0 || !Array.isArray(ids) || !Array.isArray(hashes)
      || ids.length === 0 || ids.length >= SYNC_FROM_ZERO_DATASET.nodeCount
      || ids.length !== committed.datasetNodeCount || hashes.length !== ids.length
      || new Set(ids).size !== ids.length || [...ids, ...hashes].some(value => typeof value !== 'string' || !value)) {
    throw new Error('Sync-from-zero committed dataset evidence is incomplete.');
  }
  for (const facts of [receipt.interruptedFacts, receipt.restartedFacts, receipt.finalFacts].filter(Boolean)) {
    const retained = new Map((facts.datasetNodeIds ?? []).map((id, index) => [id, facts.datasetContentHashes?.[index]]));
    if (ids.some((id, index) => !retained.has(id) || retained.get(id) !== hashes[index])) {
      throw new Error('Sync-from-zero committed dataset facts changed after interruption.');
    }
  }
  if (!receipt.interruptedFacts || !receipt.restartedFacts) {
    throw new Error('Sync-from-zero restart evidence is incomplete.');
  }
  return receipt;
}
import { createHash } from 'node:crypto';
