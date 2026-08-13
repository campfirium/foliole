// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { syncFromZeroDatasetDigest } from './sync-from-zero-contract.mjs';
import { inspectSyncFromZeroDatasetFacts } from './sync-from-zero-dataset-inspect.mjs';
import { assertSyncFromZeroFinalProof } from './multi-device-sync-from-zero-evidence.mjs';

const datasetReceipt = { attachmentIds: Array.from({ length: 65 }, (_, i) => `a-${i}`),
  contentHashes: Array.from({ length: 40 }, (_, i) => `h-${i}`),
  nodeIds: Array.from({ length: 40 }, (_, i) => `n-${i}`) };
const datasetDigest = syncFromZeroDatasetDigest(datasetReceipt);
const facts = { datasetAttachmentCount: 65, datasetCachedAttachmentCount: 65,
  datasetCachedContentBlobCount: 40, datasetContentBlobCount: 40, datasetDigest,
  datasetNodeCount: 40 };

it('reads dataset content identity through the current nodes body blob schema', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, body_blob_hash TEXT, deleted_at TEXT);
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
    CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT);
    CREATE TABLE attachment_blobs (
      attachment_id TEXT PRIMARY KEY, content_hash TEXT, availability TEXT
    );
    INSERT INTO nodes VALUES ('sync-from-zero-a-001', 'body-1', NULL);
    INSERT INTO content_blobs VALUES ('body-1');
    INSERT INTO content_blob_data VALUES ('body-1', X'01');
    INSERT INTO node_attachments VALUES ('sync-from-zero-a-001', 'attachment-1');
    INSERT INTO attachment_blobs VALUES ('attachment-1', 'attachment-hash-1', 'cached');
  `);
  expect(inspectSyncFromZeroDatasetFacts(database)).toMatchObject({
    datasetAttachmentCount: 1,
    datasetAttachmentIds: ['attachment-1'],
    datasetCachedAttachmentCount: 1,
    datasetCachedContentBlobCount: 1,
    datasetContentBlobCount: 1,
    datasetContentHashes: ['body-1'],
    datasetNodeCount: 1,
    datasetNodeIds: ['sync-from-zero-a-001']
  });
  database.close();
});

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
