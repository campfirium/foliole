import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { openCycleFlow } from '../../../../../lib/core/flow/cycleFlowOpen';
import { dailyFlowSettingsForInstant } from '../../../../../lib/core/flow/dailyFlowDayWindow';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { collectNodeVersionPayloads } from '../../../../../lib/core/sync/nodeVersionPayloadCollector';
import { applySyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeApplyExecutor';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import { topicTextSnapshotHash } from '../../../../../lib/core/sync/topicTextSnapshotHash';
import type { NativeSyncNodeRecord } from '../../../../../lib/platform/nativeSyncContract';
import { resolveWorkspaceMetadataHistory, workspaceNodeMetadata, type WorkspaceRelatedReading, type WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';
import { createCompanionUuid } from '../../companionUuid';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { appendCompanionFlowHistory, companionFlowHistoryKey } from './companionFlowHistoryStore';
import { writeCompanionHistoryReadings } from './companionHistoryLearning';
import { applyCompanionHistoryOrders, captureCompanionHistoryOrders, completeCompanionHistoryOrders, validateCompanionHistoryOrders } from './companionHistoryOrder';
import { iosCompanionHostName } from './iosCompanionMutationState';

export async function commitCompanionNodeHistoryWithDb(db: DbPort, records: NativeSyncNodeRecord[],
  title: string, operation: 'local_mutation' | 'local_restore' = 'local_mutation', subtreeNodeIds: string[] | null = null, relatedReadings: WorkspaceRelatedReading[] = [],
  sessions: Pick<WorkspaceNodeMetadataHistoryEntry, 'beforeSession' | 'afterSession'> = { beforeSession: null, afterSession: null }) {
  if (!records.length) return;
  const daily = sessions.beforeSession?.cycle ? await readDailyFlow(db) : null;
  const now = records[0]!.snapshot.updated_at;
  const flowArgs = { now, mode: daily?.mode as 'recommended' | 'review-first' | 'reading-only' };
  const settings = await dailyFlowSettingsForInstant(db, companionDailyFlowSettings(), now, false, daily);
  const flowBefore = daily ? (await openCycleFlow(db, flowArgs, settings, companionDailyFlowPersistence)).session : null;
  const before = await Promise.all(records.map(record => loadCompanionWorkspaceNodeFromDb(db, record.object_id)));
  if (records.some((record, i) => (before[i]?.currentVersionId ?? null) !== (record.parent_version_id ?? null))) {
    throw new Error('workspace_history_source_changed');
  }
  const parents = records.flatMap((record, i) => before[i] && before[i]!.parentNodeId !== record.snapshot.parent_id
    ? [before[i]!.parentNodeId, record.snapshot.parent_id] : []);
  const orders = await captureCompanionHistoryOrders(db, parents);
  const result = await applySyncNodesWithDbPort(db, records, {
    enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation
  });
  if (result.conflictNodes.length || records.some(record => !result.appliedIds.includes(record.object_id))) {
    throw new Error('workspace_mutation_not_applied');
  }
  const after = await Promise.all(records.map(record => loadCompanionWorkspaceNodeFromDb(db, record.object_id)));
  await writeCompanionHistoryReadings(db, relatedReadings, 'redo');
  if (flowBefore) sessions = { beforeSession: flowBefore, afterSession:
    (await openCycleFlow(db, flowArgs, settings, companionDailyFlowPersistence, true)).session };
  const entry: WorkspaceNodeMetadataHistoryEntry = {
    type: 'nodes.change', ...sessions, relatedReadings, orders: await completeCompanionHistoryOrders(db, orders), id: createCompanionUuid(), title, rootNodeId: records[0]!.object_id, subtreeNodeIds,
    changes: after.map((node, i) => {
      if (!node) throw new Error('workspace_mutation_not_applied');
      return { nodeId: node.id, before: before[i] ? workspaceNodeMetadata(before[i]!) : null,
        after: workspaceNodeMetadata(node), creationContent: before[i] ? null : hashTextBody(JSON.stringify([node.content, node.reveal])) };
    })
  };
  for (const node of records) await collectNodeVersionPayloads(db, node.object_id, Number.MAX_SAFE_INTEGER);
  await appendCompanionFlowHistory(db, companionFlowHistoryKey(await iosCompanionHostName(db)), entry);
}

export async function replayCompanionNodeHistoryWithDb(db: DbPort, entry: WorkspaceNodeMetadataHistoryEntry, mode: 'undo' | 'redo') {
  const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
  if (!snapshot) throw new Error('workspace_history_unavailable');
  const loaded = await Promise.all(entry.changes.map(change => loadCompanionWorkspaceNodeFromDb(db, change.nodeId)));
  const nodes = { ...snapshot.nodesById, ...Object.fromEntries(loaded.filter(node => node !== null).map(node => [node.id, node])) };
  const host = await iosCompanionHostName(db);
  const targets = resolveWorkspaceMetadataHistory(entry, mode, nodes, new Date().toISOString());
  await validateCompanionHistoryOrders(db, entry.orders, mode);
  await writeCompanionHistoryReadings(db, entry.relatedReadings, mode);
  const records = await Promise.all(targets.map(node => createCompanionMetadataVersion(db, node, host)));
  const restoring = targets.some(node => !node.deletedAt && nodes[node.id]?.deletedAt);
  const result = await applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false,
    includeAlreadyApplied: true, operation: restoring ? 'local_restore' : 'local_mutation' });
  if (result.conflictNodes.length || targets.some(node => !result.appliedIds.includes(node.id))) {
    throw new Error('workspace_history_not_applied');
  }
  await applyCompanionHistoryOrders(db, entry.orders, mode, host);
  for (const node of targets) await collectNodeVersionPayloads(db, node.id, Number.MAX_SAFE_INTEGER);
}

export async function createCompanionMetadataVersion(db: DbPort, node: WorkspaceNodeSnapshot, host: string, versionId?: string) {
  const current = await loadCurrentSyncNodeRecord(db, node.id);
  if (!current) {
    if (await loadCompanionWorkspaceNodeFromDb(db, node.id)) throw new Error('workspace_base_unavailable');
    return toWorkspaceNativeNodeVersion(node, host, versionId);
  }
  const snapshot = { ...current.snapshot, title: node.title, is_title_manual: node.isTitleManual,
    parent_id: node.parentNodeId, deleted_at: node.deletedAt ?? null, shelved_at: node.shelvedAt ?? null,
    sequential_reading_enabled: node.sequentialReadingEnabled ?? null, updated_at: node.updatedAt };
  return { ...current, snapshot, content_hash: topicTextSnapshotHash(snapshot), host_name: host,
    version_id: versionId ?? `ver_${createCompanionUuid()}`, version_created_at: node.updatedAt, updated_at: node.updatedAt,
    parent_version_id: current.version_id, parent_version_ids: current.version_id ? [current.version_id] : [],
    ancestor_version_ids: current.version_id ? [current.version_id, ...current.ancestor_version_ids] : [] };
}
