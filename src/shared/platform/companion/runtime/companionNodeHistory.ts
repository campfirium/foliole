import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { hashTextBody } from '../../../../../lib/core/database/textBodyHash';
import { toWorkspaceNativeNodeVersion } from '../../../../../lib/core/database/workspaceNodeSyncVersion';
import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape, type WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { openCycleFlow } from '../../../../../lib/core/flow/cycleFlowOpen';
import { dailyFlowSettingsForInstant, differsFromStoredFlowWindow } from '../../../../../lib/core/flow/dailyFlowDayWindow';
import { flowDay } from '../../../../../lib/core/flow/dailyFlowPlanning';
import { openDailyFlow } from '../../../../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../../../../lib/core/flow/dailyFlowStorage';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { applyLocalNodeVersionsWithDbPort, nodeColumns, readLocalNodeVersionStates } from '../../../../../lib/core/sync/localNodeVersionApply';
import { collectNodeVersionPayloads } from '../../../../../lib/core/sync/nodeVersionPayloadCollector';
import { loadCurrentSyncNodeRecordsInOneRead } from '../../../../../lib/core/sync/syncNodeGraphOneRead';
import { topicTextSnapshotHash } from '../../../../../lib/core/sync/topicTextSnapshotHash';
import type { NativeSyncNodeRecord } from '../../../../../lib/platform/nativeSyncContract';
import { resolveWorkspaceMetadataHistory, workspaceNodeMetadata, type WorkspaceRelatedReading, type WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { createCompanionUuid } from '../../companionUuid';
import { traceCompanionSyncEvent } from '../sync/diagnostics/companionDesktopSyncTrace';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { companionDailyFlowPersistence, companionDailyFlowSettings } from './companionDailyFlow';
import { appendCompanionFlowHistory, companionFlowHistoryKey } from './companionFlowHistoryStore';
import { writeCompanionHistoryReadings } from './companionHistoryLearning';
import { recordCompanionHistoryOrders, validateCompanionHistoryOrders } from './companionHistoryOrder';
import { loadCompanionWriteNodes } from './companionWriteNodes';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';
import { iosCompanionHostName } from './iosCompanionMutationState';

export async function commitCompanionNodeHistoryWithDb(db: DbPort, records: NativeSyncNodeRecord[],
  title: string, operation: 'local_mutation' | 'local_restore' = 'local_mutation', subtreeNodeIds: string[] | null = null, relatedReadings: WorkspaceRelatedReading[] = [],
  sessions: Pick<WorkspaceNodeMetadataHistoryEntry, 'beforeSession' | 'afterSession'> = { beforeSession: null, afterSession: null },
  hostName?: string) {
  if (!records.length) return;
  const daily = sessions.beforeSession?.cycle ? await readDailyFlow(db) : null;
  const now = records[0]!.snapshot.updated_at;
  const flowArgs = { now, mode: daily?.mode as 'recommended' | 'review-first' | 'reading-only' };
  const settings = await dailyFlowSettingsForInstant(db, companionDailyFlowSettings(), now, false, daily);
  const flowBefore = daily ? (await (daily.day_key !== flowDay(now, settings) || differsFromStoredFlowWindow(daily, settings)
    ? openDailyFlow(db, flowArgs, settings, companionDailyFlowPersistence)
    : openCycleFlow(db, flowArgs, settings, companionDailyFlowPersistence))).session : null;
  // One read gives the nodes as they are and what the local write path checks before storing the records.
  const states = await readLocalNodeVersionStates(db, records);
  const before = records.map(record => {
    const state = states.get(record.object_id);
    return state?.node_id ? buildWorkspaceSnapshotNode(nodeColumns(state) as unknown as WorkspaceNodeRowShape) : null;
  });
  if (records.some((record, i) => (before[i]?.currentVersionId ?? null) !== (record.parent_version_id ?? null))) {
    throw new Error('workspace_history_source_changed');
  }
  const parents = records.flatMap((record, i) => before[i] && before[i]!.parentNodeId !== record.snapshot.parent_id
    ? [before[i]!.parentNodeId, record.snapshot.parent_id] : []);
  const result = await applyLocalNodeVersionsWithDbPort(db, records, operation, states);
  if (result.conflictNodes.length || records.some(record => !result.appliedIds.includes(record.object_id))) {
    throw new Error('workspace_mutation_not_applied');
  }
  // The local path returns the rows it wrote; after the remote apply chain the nodes are read back.
  const after = await Promise.all(records.map(async record => {
    const row = result.rows?.get(record.object_id);
    return row ? buildWorkspaceSnapshotNode(row as unknown as WorkspaceNodeRowShape) : loadCompanionWorkspaceNodeFromDb(db, record.object_id);
  }));
  await writeCompanionHistoryReadings(db, relatedReadings, 'redo');
  if (flowBefore) sessions = { beforeSession: flowBefore, afterSession:
    (await openCycleFlow(db, flowArgs, settings, companionDailyFlowPersistence, true)).session };
  const entry: WorkspaceNodeMetadataHistoryEntry = {
    type: 'nodes.change', ...sessions, relatedReadings, orders: await recordCompanionHistoryOrders(db, parents), id: createCompanionUuid(), title, rootNodeId: records[0]!.object_id, subtreeNodeIds,
    changes: after.map((node, i) => {
      if (!node) throw new Error('workspace_mutation_not_applied');
      const previous = before[i];
      const priorityChanged = Boolean(previous && (previous.priority ?? null) !== (node.priority ?? null));
      const orderChanged = Boolean(previous && JSON.stringify(previous.manualChildOrder ?? null) !== JSON.stringify(node.manualChildOrder ?? null));
      return { nodeId: node.id, before: previous ? workspaceNodeMetadata(previous, priorityChanged, orderChanged) : null,
        after: workspaceNodeMetadata(node, priorityChanged, orderChanged), creationContent: before[i] ? null : hashTextBody(JSON.stringify([node.content, node.reveal])) };
    })
  };
  await appendCompanionFlowHistory(db, companionFlowHistoryKey(hostName ?? await iosCompanionHostName(db)), entry);
  scheduleCompanionNodeVersionCollection(records.map(record => record.object_id));
}

/**
 * Releasing superseded bodies does not change what the edit shows, so it waits until editing has paused (every edit
 * restarts the wait, up to a limit so continuous editing still releases) and then runs as one write for every node
 * edited meanwhile. An interrupted release only keeps an older body until the node's next write or sync collects it.
 */
export function scheduleCompanionNodeVersionCollection(nodeIds: readonly string[]) {
  // A release belongs to the library that was edited; switching libraries leaves the rest to that library's next write.
  // A write through a connection outside the active owner (a side database) leaves it to the node's next write or sync.
  let owner: ReturnType<typeof getIosCompanionDatabaseOwner>;
  try { owner = getIosCompanionDatabaseOwner(); } catch { return; }
  if (collectionOwner !== owner) pendingCollectionIds.clear();
  collectionOwner = owner;
  if (!pendingCollectionIds.size) firstPendingAt = Date.now();
  for (const id of nodeIds) pendingCollectionIds.add(id);
  armCollectionTimer();
}

/**
 * Holds the release off while a foreground save and its refresh run, and restarts the wait once they end. The release
 * shares the database queue with the refresh reads, so one that fires as the next save starts (saves about as far
 * apart as the wait) would run between that save's write and its refresh; restarting the wait inside the write comes
 * too late to prevent that. A release past the limit runs shortly after the save ends instead of inside it.
 */
export async function holdCompanionNodeVersionCollectionDuring<T>(task: () => Promise<T>): Promise<T> {
  heldBySaves += 1;
  if (collectionTimer) clearTimeout(collectionTimer);
  collectionTimer = null;
  try { return await task(); }
  finally {
    heldBySaves -= 1;
    armCollectionTimer();
  }
}

function armCollectionTimer() {
  if (!pendingCollectionIds.size || heldBySaves) return;
  if (collectionTimer) clearTimeout(collectionTimer);
  const delay = Math.max(COLLECTION_SETTLE_MS,
    Math.min(COLLECTION_DELAY_MS, firstPendingAt + COLLECTION_MAX_WAIT_MS - Date.now()));
  collectionTimer = setTimeout(() => {
    collectionTimer = null;
    if (!heldBySaves) void runPendingCollections();
  }, delay);
}

const COLLECTION_DELAY_MS = 1500;
const COLLECTION_MAX_WAIT_MS = 10_000;
// Lets the saved article paint before a release past the limit takes the database.
const COLLECTION_SETTLE_MS = 300;
let firstPendingAt = 0;
let heldBySaves = 0;
const pendingCollectionIds = new Set<string>();
let collectionTimer: ReturnType<typeof setTimeout> | null = null;
let runningCollection: Promise<void> | null = null;
let collectionOwner: ReturnType<typeof getIosCompanionDatabaseOwner> | null = null;

function runPendingCollections() {
  if (collectionTimer) clearTimeout(collectionTimer);
  collectionTimer = null;
  const ids = [...pendingCollectionIds];
  const owner = collectionOwner;
  pendingCollectionIds.clear();
  if (!ids.length || !owner) return runningCollection ?? Promise.resolve();
  const previous = runningCollection ?? Promise.resolve();
  const queuedAt = performance.now();
  const collection = previous.then(() => runCompanionSyncWriterTask(async () => {
    if (owner !== getIosCompanionDatabaseOwner()) return;
    const startedAt = performance.now();
    await owner.runWriter(async db => {
      for (const id of ids) await collectNodeVersionPayloads(db, id, Number.MAX_SAFE_INTEGER);
    }, { kind: 'business' });
    // When the release ran and for how long it held the database, to tell whether it sat in a foreground action.
    traceCompanionSyncEvent('version_collection', 'completed', { nodes: ids.length,
      queuedMs: Math.round(startedAt - queuedAt), writeMs: Math.round(performance.now() - startedAt) });
  })).then(() => undefined, (error: unknown) => {
    console.warn('[node-version-retention] local collection failed', error);
  });
  runningCollection = collection;
  void collection.finally(() => { if (runningCollection === collection) runningCollection = null; });
  return collection;
}

/** Runs every scheduled body release now; tests compare stored history after it. */
export async function settleCompanionNodeVersionCollections() {
  await runPendingCollections();
}

export async function replayCompanionNodeHistoryWithDb(db: DbPort, entry: WorkspaceNodeMetadataHistoryEntry, mode: 'undo' | 'redo') {
  const host = await iosCompanionHostName(db);
  const base = await loadCompanionHistoryReplayNodes(db, entry, host) ?? (await loadIosCompanionWorkspaceSnapshot(db))?.nodesById;
  if (!base) throw new Error('workspace_history_unavailable');
  const loaded = await Promise.all(entry.changes.map(change => loadCompanionWorkspaceNodeFromDb(db, change.nodeId)));
  const nodes = { ...base, ...Object.fromEntries(loaded.filter(node => node !== null).map(node => [node.id, node])) };
  const targets = resolveWorkspaceMetadataHistory(entry, mode, nodes, new Date().toISOString());
  await validateCompanionHistoryOrders(db, entry.orders);
  await writeCompanionHistoryReadings(db, entry.relatedReadings, mode);
  const records = await createCompanionMetadataVersions(db, targets, host);
  // A manual index's source list travels in its own column, which a metadata version otherwise carries unchanged.
  for (const [index, change] of entry.changes.entries()) {
    const order = (mode === 'undo' ? change.before : change.after)?.manualChildOrder;
    const record = records[index];
    if (order === undefined || !record) continue;
    record.snapshot = { ...record.snapshot, manual_child_order: order === null ? null : JSON.stringify(order) };
    record.content_hash = topicTextSnapshotHash(record.snapshot);
  }
  const restoring = targets.some(node => !node.deletedAt && nodes[node.id]?.deletedAt);
  // A replay stores versions this host builds on the current ones, as an edit does.
  const result = await applyLocalNodeVersionsWithDbPort(db, records, restoring ? 'local_restore' : 'local_mutation');
  if (result.conflictNodes.length || targets.some(node => !result.appliedIds.includes(node.id))) {
    throw new Error('workspace_history_not_applied');
  }
  scheduleCompanionNodeVersionCollection(targets.map(node => node.id));
}

/**
 * Reads the nodes a replay checks: the changed subtrees, their ancestors and both parents of every change.
 * A replay writes the saved related readings and checks parent order fingerprints instead of maintaining Sequential Reading,
 * so it never needs the whole library for them. Returns null when a changed node is gone.
 */
export function loadCompanionHistoryReplayNodes(db: DbPort, entry: WorkspaceNodeMetadataHistoryEntry, host?: string) {
  return loadCompanionWriteNodes(db, [...new Set([entry.rootNodeId, ...entry.changes.map(change => change.nodeId)])], {
    host, attachments: false, sequentialReading: false, pathIds: entry.changes.flatMap(change => [change.before?.parentNodeId ?? null, change.after.parentNodeId])
  });
}

export async function createCompanionMetadataVersion(db: DbPort, node: WorkspaceNodeSnapshot, host: string, versionId?: string) {
  return (await createCompanionMetadataVersions(db, [node], host, versionId ? [versionId] : undefined))[0]!;
}

/** Builds the next version of every node on top of its current one, reading all current versions in one statement. */
export async function createCompanionMetadataVersions(db: DbPort, nodes: readonly WorkspaceNodeSnapshot[], host: string,
  versionIds?: readonly string[]): Promise<NativeSyncNodeRecord[]> {
  const currents = await loadCurrentSyncNodeRecordsInOneRead(db, nodes.map(node => node.id));
  const records: NativeSyncNodeRecord[] = [];
  for (const [index, node] of nodes.entries()) {
    const versionId = versionIds?.[index];
    const current = currents.get(node.id);
    if (!current) {
      if (await loadCompanionWorkspaceNodeFromDb(db, node.id)) throw new Error('workspace_base_unavailable');
      records.push(await toWorkspaceNativeNodeVersion(node, host, versionId));
      continue;
    }
    const snapshot = { ...current.snapshot, title: node.title, is_title_manual: node.isTitleManual,
      parent_id: node.parentNodeId, priority: node.priority ?? null, deleted_at: node.deletedAt ?? null, shelved_at: node.shelvedAt ?? null,
      sequential_reading_enabled: node.sequentialReadingEnabled ?? null, updated_at: node.updatedAt };
    records.push({ ...current, snapshot, content_hash: topicTextSnapshotHash(snapshot), host_name: host,
      version_id: versionId ?? `ver_${createCompanionUuid()}`, version_created_at: node.updatedAt, updated_at: node.updatedAt,
      parent_version_id: current.version_id, parent_version_ids: current.version_id ? [current.version_id] : [],
      ancestor_version_ids: current.version_id ? [current.version_id, ...current.ancestor_version_ids] : [] });
  }
  return records;
}
