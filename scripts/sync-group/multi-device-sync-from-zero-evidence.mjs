import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import {
  identityFingerprint, inspectPairSyncRecoveryWorkspace
} from '../android/android-pair-sync-recovery-readiness.mjs';
import { A5_SERIAL } from '../android/macos-a5-dev.mjs';
import {
  assertSyncFromZeroDatasetFacts, syncFromZeroDatasetDigest, SYNC_FROM_ZERO_DATASET
} from './sync-from-zero-contract.mjs';
import { inspectSyncFromZeroDatasetFacts } from './sync-from-zero-dataset-inspect.mjs';
import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';
import { assertExactDatasetConvergence } from './sync-scenario-predicate.mjs';

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

function androidSnapshotObservation(snapshot) {
  return {
    attachmentArchiveBytes: snapshot?.attachments?.size ?? 0,
    databaseError: snapshot?.database?.error ?? null,
    databaseExists: snapshot?.database?.exists ?? false,
    databaseUnreadable: snapshot?.database?.unreadable ?? false
  };
}

function hasAndroidSyncFromZeroFacts(snapshot, activeMemberCount) {
  const facts = snapshot?.database?.inspection;
  if (!facts || facts.activeSyncGroupMemberCount !== activeMemberCount) return false;
  try {
    assertSyncFromZeroDatasetFacts(facts);
    return true;
  } catch {
    return false;
  }
}

export async function waitForAndroidSyncFromZeroProofSnapshot(paths, {
  activeMemberCount = 3, collectSnapshot = collectAndroidSyncFromZeroSnapshot,
  delayMs = 1_000, includeAttachments = false, timeoutMs = 30_000
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  do {
    snapshot = await collectSnapshot(paths, false);
    if (hasAndroidSyncFromZeroFacts(snapshot, activeMemberCount)) break;
    if (Date.now() < deadline) await delay(delayMs);
  } while (Date.now() < deadline);
  if (!hasAndroidSyncFromZeroFacts(snapshot, activeMemberCount)) {
    throw new Error(`Android sync-from-zero proof snapshot did not become readable: ${JSON.stringify(
      androidSnapshotObservation(snapshot)
    )}`);
  }
  if (!includeAttachments) return snapshot;
  let archiveSnapshot;
  do {
    archiveSnapshot = await collectSnapshot(paths, true);
    if ((archiveSnapshot?.attachments?.size ?? 0) > 0) {
      return { ...snapshot, attachments: archiveSnapshot.attachments };
    }
    if (Date.now() < deadline) await delay(delayMs);
  } while (Date.now() < deadline);
  throw new Error(`Android sync-from-zero attachment proof did not become readable: ${JSON.stringify(
    androidSnapshotObservation(archiveSnapshot)
  )}`);
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
  const contentHashes = datasetReceipt.nodeIds.map((id) => snapshot.nodesById?.[id]?.bodyBlobHash ?? '');
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

function requiredAndroidInspection(snapshot, label) {
  const inspection = snapshot?.database?.inspection;
  if (inspection) return inspection;
  throw new Error(`Android ${label} inspection is unavailable: ${JSON.stringify(
    androidSnapshotObservation(snapshot)
  )}`);
}

export function assertSyncFromZeroFinalProof({ androidAfterC, androidFinal, datasetReceipt,
  macos, runId, windowsReceipt }) {
  assertSyncFromZeroDatasetFacts(windowsReceipt.finalFacts);
  const afterC = requiredAndroidInspection(androidAfterC, 'after-C');
  const android = requiredAndroidInspection(androidFinal, 'final');
  assertSyncFromZeroDatasetFacts(afterC);
  assertSyncFromZeroDatasetFacts(android);
  const expectedDigest = syncFromZeroDatasetDigest(datasetReceipt);
  const proof = assertExactDatasetConvergence({ mutation: { datasetDigest: expectedDigest, runId },
    observations: [macos, android, windowsReceipt.finalFacts] });
  if (macos.datasetNodeCount !== SYNC_FROM_ZERO_DATASET.nodeCount
      || macos.readyAttachmentCount !== SYNC_FROM_ZERO_DATASET.attachmentCount
      || [macos.datasetDigest, android.datasetDigest, windowsReceipt.finalFacts.datasetDigest]
        .some((value) => value !== expectedDigest)
      || !androidFinal.attachments || androidFinal.attachments.size <= 0) {
    throw new Error('Three-host exact sync-from-zero dataset evidence is incomplete.');
  }
  return { ...proof, attachmentCount: SYNC_FROM_ZERO_DATASET.attachmentCount,
    nodeCount: SYNC_FROM_ZERO_DATASET.nodeCount };
}
