// @vitest-environment node

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import { syncFromZeroDatasetDigest } from './sync-from-zero-contract.mjs';
import { inspectSyncFromZeroDatasetFacts } from './sync-from-zero-dataset-inspect.mjs';
import {
  assertSyncFromZeroFinalProof, inspectMacosSyncFromZeroDataset,
  waitForAndroidSyncFromZeroProofSnapshot
} from './multi-device-sync-from-zero-evidence.mjs';

const datasetReceipt = { attachmentIds: Array.from({ length: 65 }, (_, i) => `a-${i}`),
  contentHashes: Array.from({ length: 40 }, (_, i) => `h-${i}`),
  nodeIds: Array.from({ length: 40 }, (_, i) => `n-${i}`) };
const datasetDigest = syncFromZeroDatasetDigest(datasetReceipt);
const facts = { datasetAttachmentCount: 65, datasetCachedAttachmentCount: 65,
  datasetCachedContentBlobCount: 40, datasetContentBlobCount: 40, datasetDigest,
  datasetNodeCount: 40 };

it('reads exact current head bodies and node-owned resources without legacy caches', () => {
  const body = 'Original body中文😀';
  const hash = createHash('sha256').update(body).digest('hex');
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, body_blob_hash TEXT, deleted_at TEXT, resource_references TEXT NOT NULL DEFAULT '[]', content TEXT, current_version_id TEXT);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT, body_text TEXT);
    INSERT INTO nodes VALUES ('sync-from-zero-a-001', '${hash}', NULL,
      '[{"storage_key":"${'a'.repeat(64)}.png","role":"image","original_name":null}]', '${body}', 'version-1');
    INSERT INTO node_sync_versions VALUES ('version-1', 'sync-from-zero-a-001', '${body}');
  `);
  expect(inspectSyncFromZeroDatasetFacts(database, ['a'.repeat(64)])).toMatchObject({
    datasetAttachmentCount: 1,
    datasetAttachmentIds: ['a'.repeat(64)],
    datasetCachedAttachmentCount: 1,
    datasetCachedContentBlobCount: 1,
    datasetContentBlobCount: 1,
    datasetContentHashes: [hash],
    datasetNodeCount: 1,
    datasetNodeIds: ['sync-from-zero-a-001']
  });
  database.exec("UPDATE nodes SET content = 'different projection'");
  expect(inspectSyncFromZeroDatasetFacts(database).datasetCachedContentBlobCount).toBe(0);
  database.exec("UPDATE node_sync_versions SET body_text = 'corrupt body'");
  expect(inspectSyncFromZeroDatasetFacts(database).datasetContentBlobCount).toBe(0);
  database.close();
});

it('uses the desktop body blob identity when list content is intentionally empty', async () => {
  const receipt = { attachmentIds: ['attachment-1'], contentHashes: ['body-1'], nodeIds: ['node-1'] };
  const session = {
    invoke: async (channel) => channel === 'load_workspace_list_snapshot'
      ? { nodesById: { 'node-1': { bodyBlobHash: 'body-1', content: '' } } }
      : { status: 'ready' },
    load: async () => ({ sync_group: { devices: [{ state: 'active' }], group_id: 'group-1',
      timeline_id: 'timeline-1' } })
  };
  await expect(inspectMacosSyncFromZeroDataset(session, receipt)).resolves.toMatchObject({
    datasetDigest: syncFromZeroDatasetDigest(receipt), datasetNodeCount: 1,
    readyAttachmentCount: 1
  });
});

it('accepts the exact dataset independently of provider cursor bookkeeping', () => {
  const windowsReceipt = { candidate: { groupId: 'group-1' },
    finalFacts: { ...facts, activeMemberCount: 3, deviceIdentity: 'windows-1',
      localTimelineId: 'timeline-1', receiveCursor: 80 },
    firstCommittedFacts: { receiveCursor: 80 }, initialFacts: { receiveCursor: 0 },
    interruptedFacts: { receiveCursor: 80 }, restartedFacts: { receiveCursor: 80 } };
  const inspection = { ...facts, activeSyncGroupMemberCount: 3, syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1' };
  const proof = assertSyncFromZeroFinalProof({
    androidAfterC: { database: { inspection } },
    androidFinal: { attachments: { size: 1 }, database: { inspection } }, datasetReceipt,
    macos: { activeMemberCount: 3, datasetDigest, datasetNodeCount: 40, groupId: 'group-1',
      readyAttachmentCount: 65, timelineId: 'timeline-1' }, runId: 'run-1', windowsReceipt
  });
  expect(proof).toMatchObject({ attachmentCount: 65, datasetDigest, nodeCount: 40, runId: 'run-1' });
});

it('rejects latest/cursor evidence when the exact dataset does not match', () => {
  const windowsReceipt = { candidate: { groupId: 'group-1' },
    finalFacts: { ...facts, datasetDigest: 'other-digest', activeMemberCount: 3, deviceIdentity: 'windows-1',
      localTimelineId: 'timeline-1', receiveCursor: 80 },
    firstCommittedFacts: { receiveCursor: 80 }, initialFacts: { receiveCursor: 0 },
    interruptedFacts: { receiveCursor: 80 }, restartedFacts: { receiveCursor: 80 } };
  const inspection = { ...facts, activeSyncGroupMemberCount: 3, syncGroupId: 'group-1', syncGroupTimelineId: 'timeline-1' };
  expect(() => assertSyncFromZeroFinalProof({
    androidAfterC: { database: { inspection } },
    androidFinal: { attachments: { size: 1 }, database: { inspection } }, datasetReceipt,
    macos: { activeMemberCount: 3, datasetDigest, datasetNodeCount: 40, groupId: 'group-1',
      readyAttachmentCount: 65, timelineId: 'timeline-1' }, runId: 'run-1', windowsReceipt
  })).toThrow('exact dataset');
});

it('retries a transient unreadable Android database before collecting attachment proof', async () => {
  const inspection = { ...facts, activeSyncGroupMemberCount: 3 };
  const includeAttachments = [];
  let databaseAttempts = 0;
  const snapshot = await waitForAndroidSyncFromZeroProofSnapshot({}, {
    collectSnapshot: async (_paths, includeArchive) => {
      includeAttachments.push(includeArchive);
      if (includeArchive) {
        return { attachments: { sha256: 'archive', size: 42 },
          database: { error: 'transient WAL copy', unreadable: true } };
      }
      databaseAttempts += 1;
      return databaseAttempts === 1
        ? { database: { error: 'transient WAL copy', exists: true, unreadable: true } }
        : { database: { exists: true, inspection } };
    }, delayMs: 0, includeAttachments: true, timeoutMs: 100
  });
  expect(includeAttachments).toEqual([false, false, true]);
  expect(snapshot.database.inspection).toBe(inspection);
  expect(snapshot.attachments).toMatchObject({ size: 42 });
});

it('reports an unavailable Android inspection instead of dereferencing it', () => {
  const windowsReceipt = { candidate: { groupId: 'group-1' },
    finalFacts: { ...facts, activeMemberCount: 3, receiveCursor: 80 },
    firstCommittedFacts: { receiveCursor: 80 }, initialFacts: { receiveCursor: 0 },
    interruptedFacts: { receiveCursor: 80 }, restartedFacts: { receiveCursor: 80 } };
  expect(() => assertSyncFromZeroFinalProof({
    androidAfterC: { database: { error: 'transient WAL copy', exists: true, unreadable: true } },
    androidFinal: {}, datasetReceipt, macos: {}, windowsReceipt
  })).toThrow(/Android after-C inspection is unavailable.*transient WAL copy/u);
});
