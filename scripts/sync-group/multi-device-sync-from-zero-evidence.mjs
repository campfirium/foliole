import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import {
  identityFingerprint, inspectPairSyncRecoveryWorkspace
} from '../android/android-pair-sync-recovery-readiness.mjs';
import { A5_SERIAL } from '../android/macos-a5-dev.mjs';
import {
  assertSyncFromZeroCursorContinuity, assertSyncFromZeroDatasetFacts,
  syncFromZeroDatasetDigest, SYNC_FROM_ZERO_DATASET
} from './sync-from-zero-contract.mjs';
import { inspectSyncFromZeroDatasetFacts } from './sync-from-zero-dataset-inspect.mjs';
import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';

const APP_ID = 'com.foliole.android';

function peerProgress(database) {
  return database.prepare(`SELECT peer_id, stream_name, cursor_value FROM sync_peer_cursors
    ORDER BY stream_name, peer_id`).all().map(({ cursor_value, peer_id, stream_name }) => ({
    cursorValue: cursor_value, peerFingerprint: identityFingerprint(peer_id), streamName: stream_name
  }));
}

export function collectAndroidSyncFromZeroSnapshot(paths, includeAttachments = false) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: APP_ID, includeAttachments,
    includeEvents: false, serial: A5_SERIAL,
    tables: ['attachments', 'content_blobs', 'nodes'], databaseInspector: (database) => ({
      ...inspectPairSyncRecoveryWorkspace(database), ...inspectSyncFromZeroDatasetFacts(database),
      peerCursors: peerProgress(database)
    }) });
}

export async function waitForAndroidSyncFromZeroDataset(paths, reportActivity, reportProgress) {
  const deadline = Date.now() + 12 * 60_000;
  const observe = createSyncProgressWatchdog({ label: 'Android B sync-from-zero dataset', stallMs: 60_000 });
  let structureReported = false;
  let contentReported = false;
  let attachmentsReported = false;
  while (Date.now() < deadline) {
    const snapshot = await collectAndroidSyncFromZeroSnapshot(paths, false);
    const facts = snapshot.database?.inspection ?? {};
    const state = [facts.datasetNodeCount, facts.datasetCachedContentBlobCount,
      facts.datasetCachedAttachmentCount];
    const changed = observe(JSON.stringify(state), facts);
    if (changed) reportActivity('android-batch-progress');
    if (!structureReported && facts.datasetNodeCount === SYNC_FROM_ZERO_DATASET.nodeCount) {
      structureReported = true; reportProgress('android-structure-batches-complete');
    }
    if (!contentReported && facts.datasetCachedContentBlobCount === SYNC_FROM_ZERO_DATASET.nodeCount) {
      contentReported = true; reportProgress('android-content-batches-complete');
    }
    if (!attachmentsReported
        && facts.datasetCachedAttachmentCount === SYNC_FROM_ZERO_DATASET.attachmentCount) {
      attachmentsReported = true; reportProgress('android-attachment-batches-complete');
    }
    try {
      assertSyncFromZeroDatasetFacts(facts);
      if (facts.activeSyncGroupMemberCount === 2) {
        return collectAndroidSyncFromZeroSnapshot(paths, true);
      }
    } catch { /* keep observing the ordinary sync backlog */ }
    await delay(1_000);
  }
  throw new Error('Android B did not complete the bounded sync-from-zero dataset.');
}

export async function inspectMacosSyncFromZeroDataset(session, datasetReceipt) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const contentHashes = datasetReceipt.nodeIds.map((id) => createHash('sha256')
    .update(snapshot.nodesById?.[id]?.content ?? '').digest('hex'));
  let readyAttachmentCount = 0;
  for (const attachmentId of datasetReceipt.attachmentIds) {
    const resolved = await session.invoke('resolve_attachment_resource', { attachment_id: attachmentId });
    if (resolved?.status === 'ready') readyAttachmentCount += 1;
  }
  const overview = await session.load();
  const nodeIds = datasetReceipt.nodeIds.filter((id) => snapshot.nodesById?.[id]);
  return {
    activeMemberCount: overview.sync_group?.members.filter(({ state }) => state === 'active').length ?? 0,
    datasetDigest: syncFromZeroDatasetDigest({
      attachmentIds: datasetReceipt.attachmentIds, contentHashes, nodeIds
    }),
    datasetNodeCount: nodeIds.length,
    groupId: overview.sync_group?.group_id ?? null,
    readyAttachmentCount,
    timelineId: overview.sync_group?.timeline_id ?? null
  };
}

export function assertSyncFromZeroFinalProof({ androidAfterC, androidFinal, datasetReceipt,
  macos, windowsReceipt }) {
  assertSyncFromZeroCursorContinuity(windowsReceipt);
  assertSyncFromZeroDatasetFacts(windowsReceipt.finalFacts);
  const afterC = androidAfterC.database?.inspection;
  const android = androidFinal.database?.inspection;
  assertSyncFromZeroDatasetFacts(afterC);
  assertSyncFromZeroDatasetFacts(android);
  const expectedDigest = syncFromZeroDatasetDigest(datasetReceipt);
  const groups = [macos.groupId, android.syncGroupId, windowsReceipt.candidate.groupId];
  const timelines = [macos.timelineId, android.syncGroupTimelineId,
    windowsReceipt.finalFacts.localTimelineId];
  const zeroSupply = afterC.peerCursors?.find(({ cursorValue, streamName }) =>
    streamName === 'sync-pack-supply' && /^0:\d+$/u.test(cursorValue));
  const suppliedTo = Number(zeroSupply?.cursorValue.split(':')[1] ?? -1);
  if (macos.datasetNodeCount !== SYNC_FROM_ZERO_DATASET.nodeCount
      || macos.readyAttachmentCount !== SYNC_FROM_ZERO_DATASET.attachmentCount
      || [macos.datasetDigest, android.datasetDigest, windowsReceipt.finalFacts.datasetDigest]
        .some((value) => value !== expectedDigest)
      || groups.some((value) => !value) || new Set(groups).size !== 1
      || timelines.some((value) => !value) || new Set(timelines).size !== 1
      || macos.activeMemberCount !== 3 || android.activeSyncGroupMemberCount !== 3
      || windowsReceipt.finalFacts.activeMemberCount !== 3
      || suppliedTo !== windowsReceipt.finalFacts.receiveCursor
      || !androidFinal.attachments || androidFinal.attachments.size <= 0) {
    throw new Error('Three-host sync-from-zero evidence is incomplete.');
  }
  return { attachmentCount: SYNC_FROM_ZERO_DATASET.attachmentCount,
    contentBlobCount: SYNC_FROM_ZERO_DATASET.nodeCount, cursor: windowsReceipt.finalFacts.receiveCursor,
    datasetDigest: expectedDigest, groupId: groups[0], nodeCount: SYNC_FROM_ZERO_DATASET.nodeCount,
    timelineId: timelines[0] };
}
