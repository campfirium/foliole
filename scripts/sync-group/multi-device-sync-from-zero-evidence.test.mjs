// @vitest-environment node

import { expect, it } from 'vitest';

import { syncFromZeroDatasetDigest } from './sync-from-zero-contract.mjs';
import { assertSyncFromZeroFinalProof } from './multi-device-sync-from-zero-evidence.mjs';

const datasetReceipt = { attachmentIds: Array.from({ length: 65 }, (_, i) => `a-${i}`),
  contentHashes: Array.from({ length: 40 }, (_, i) => `h-${i}`),
  nodeIds: Array.from({ length: 40 }, (_, i) => `n-${i}`) };
const datasetDigest = syncFromZeroDatasetDigest(datasetReceipt);
const facts = { datasetAttachmentCount: 65, datasetCachedAttachmentCount: 65,
  datasetCachedContentBlobCount: 40, datasetContentBlobCount: 40, datasetDigest,
  datasetNodeCount: 40 };

it('requires cursor-zero supply evidence and one exact three-host dataset identity', () => {
  const windowsReceipt = { candidate: { groupId: 'group-1' },
    finalFacts: { ...facts, activeMemberCount: 3, localTimelineId: 'timeline-1', receiveCursor: 80 },
    firstCommittedFacts: { receiveCursor: 80 }, initialFacts: { receiveCursor: 0 },
    interruptedFacts: { receiveCursor: 80 }, restartedFacts: { receiveCursor: 80 } };
  const inspection = { ...facts, activeSyncGroupMemberCount: 3, peerCursors: [{
    cursorValue: '0:80', streamName: 'sync-pack-supply'
  }], syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1' };
  const proof = assertSyncFromZeroFinalProof({
    androidAfterC: { database: { inspection } },
    androidFinal: { attachments: { size: 1 }, database: { inspection } }, datasetReceipt,
    macos: { activeMemberCount: 3, datasetDigest, datasetNodeCount: 40, groupId: 'group-1',
      readyAttachmentCount: 65, timelineId: 'timeline-1' }, windowsReceipt
  });
  expect(proof).toMatchObject({ attachmentCount: 65, cursor: 80, nodeCount: 40 });
});
