import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { writeDbStatements, type DbStatement } from './dbStatements.js';
import { repairDirectChildAnchorsForAppliedParent } from './syncNodeAnchorRepair.js';
import { localOriginStatements } from './syncNodeAppliedMutationState.js';
import { applySyncNodesWithDbPort, type ApplySyncNodesWithDbPortResult } from './syncNodeApplyExecutor.js';
import { decideIncomingNodeApply, orderNodesForApply } from './syncNodeApplyRules.js';
import { buildRemoteNodeUpdate, buildRemoteNodeUpsert, buildRemoteNodeVersionUpsert } from './syncNodeApplyStatements.js';
import { prepareSyncNodeTextBodyHashes } from './syncNodePreparedTextBodyHashes.js';
import { appliedNodeSyncStateStatement } from './syncNodeStateApplyExecutor.js';
import { assertSyncNodeTextWithinBudget } from './syncNodeTextBudget.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

export type LocalNodeVersionOperation = 'local_mutation' | 'local_restore';

type LocalState = {
  id: string; node_id: string | null; current_version_id: string | null; deleted_at: string | null; parent_id: string | null;
  sync_dirty: number | null; title: string | null; created_at: string | null; tombstoned: number; parent_tombstoned: number;
  version_stored: number; parent_version_stored: number; state_base: string | null; state_content: string | null;
  state_dirty: number | null; has_state: number;
};

// One read gives every fact the remote apply chain would otherwise read per record: the node, its tombstone,
// the new parent's tombstone, whether the version or its parent version is stored, and the node's sync state.
const LOCAL_STATE_SQL = `WITH r(id, parent_id, version_id, parent_version_id) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]')
  FROM json_each(?)
) SELECT r.id, n.id AS node_id, n.current_version_id, n.deleted_at, n.parent_id, n.sync_dirty, n.title, n.created_at,
  EXISTS (SELECT 1 FROM node_sync_tombstones t WHERE t.node_id = r.id) AS tombstoned,
  (r.parent_id IS NOT NULL AND EXISTS (SELECT 1 FROM node_sync_tombstones t WHERE t.node_id = r.parent_id)) AS parent_tombstoned,
  EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = r.version_id) AS version_stored,
  (r.parent_version_id IS NULL OR EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = r.parent_version_id)) AS parent_version_stored,
  s.base_content_hash AS state_base, s.content_hash AS state_content, s.sync_dirty AS state_dirty, s.object_id IS NOT NULL AS has_state
FROM r LEFT JOIN nodes n ON n.id = r.id
LEFT JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = r.id`;

// A node is visible when every node up to a root exists and is not deleted, as in the visible-nodes CTE.
const HIDDEN_PARENTS_SQL = `WITH RECURSIVE chain(start, id, depth) AS (
  SELECT value, value, 0 FROM json_each(?)
  UNION ALL SELECT chain.start, node.parent_id, chain.depth + 1 FROM chain JOIN nodes node ON node.id = chain.id
  WHERE node.parent_id IS NOT NULL AND chain.depth < 100000
) SELECT chain.start AS id, SUM(node.id IS NULL OR node.deleted_at IS NOT NULL) AS hidden
FROM chain LEFT JOIN nodes node ON node.id = chain.id GROUP BY chain.start`;

function eligible(record: NativeSyncNodeRecord) {
  return !record.is_tombstone && Boolean(record.version_id && record.host_name && record.version_created_at)
    && record.snapshot.initial_review_due === undefined;
}

function applied(ids: string[]): ApplySyncNodesWithDbPortResult {
  return { appliedIds: ids, workspaceScopeExpanded: false, workspaceStructureChanged: true, anchorRepairRecords: [], blockedIds: [],
    conflictRecords: [], conflictNodes: [], skippedConflictCopyIds: [], tombstoneBlockedIds: [], unmappedAnchorRecords: [] };
}

/**
 * Stores versions this host has just built on top of each node's current version. The remote apply chain validates
 * incoming dependencies, guards tombstones and decides conflicts for records from another host; a local record whose
 * parent is the current version needs none of that, so its writes go out in one batch after a single read.
 * Records outside that shape keep the remote apply chain unchanged.
 */
export async function applyLocalNodeVersionsWithDbPort(port: DbPort, records: NativeSyncNodeRecord[],
  operation: LocalNodeVersionOperation): Promise<ApplySyncNodesWithDbPortResult> {
  const legacy = (db: DbPort) => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation });
  if (!records.length) return applied([]);
  if (!records.every(eligible) || new Set(records.map(record => record.object_id)).size !== records.length) return legacy(port);
  for (const record of records) assertSyncNodeTextWithinBudget(record.snapshot);
  // A new node's body hash is computed here, outside the transaction, as the remote apply chain does.
  const hashes = await prepareSyncNodeTextBodyHashes(records, {});
  return port.transaction(async tx => {
    const ordered = orderNodesForApply([...records]);
    const rows = await tx.query<LocalState>(LOCAL_STATE_SQL, [JSON.stringify(ordered.map(record =>
      [record.object_id, record.snapshot.parent_id, record.version_id, record.parent_version_id ?? null]))]);
    const states = new Map(rows.map(row => [row.id, row]));
    for (const record of ordered) {
      const state = states.get(record.object_id);
      if (!state || state.tombstoned || state.parent_tombstoned || state.version_stored || !state.parent_version_stored) return legacy(tx);
      const local = state.node_id ? { current_version_id: state.current_version_id, deleted_at: state.deleted_at,
        sync_dirty: state.sync_dirty ?? 0 } : null;
      if ((local?.current_version_id ?? null) !== (record.parent_version_id ?? null)) return legacy(tx);
      const decision = decideIncomingNodeApply(local, record, operation);
      if (decision !== 'apply_fast_forward' && decision !== 'apply_missing_local') return legacy(tx);
    }
    const statements: DbStatement[] = [];
    for (const record of ordered) {
      statements.push(buildRemoteNodeVersionUpsert(record)!);
      const parents = record.parent_version_ids ?? (record.parent_version_id ? [record.parent_version_id] : []);
      for (const [ordinal, parentId] of parents.entries()) statements.push({ sql: `INSERT INTO node_sync_version_parents
        (version_id, parent_version_id, ordinal) VALUES (?, ?, ?) ON CONFLICT(version_id, parent_version_id) DO NOTHING`,
      params: [record.version_id, parentId, ordinal] });
    }
    for (const record of ordered) {
      const state = states.get(record.object_id)!;
      const hash = record.snapshot.body_blob_hash ?? hashes.get(record)!;
      statements.push(state.node_id ? buildRemoteNodeUpdate(record, hash, 0) : buildRemoteNodeUpsert(record, hash, 0));
      statements.push(...localOriginStatements(record.version_id));
      const baseContentHash = state.has_state ? (state.state_dirty === 1 ? state.state_base ?? state.state_content
        : state.state_content) : null;
      statements.push(appliedNodeSyncStateStatement(record, { baseContentHash, syncDirty: 1 }));
    }
    const hidden = await hiddenParents(tx, ordered, states);
    await writeDbStatements(tx, statements);
    const batch = new Set(ordered.map(record => record.object_id));
    for (const record of ordered) {
      const content = record.body_text ?? record.snapshot.content;
      if (record.snapshot.deleted_at || typeof content !== 'string') continue;
      await repairDirectChildAnchorsForAppliedParent({ content, excludedNodeIds: batch, parentNodeId: record.object_id,
        port: tx, sourceVersionId: record.version_id, updatedAt: record.snapshot.updated_at });
    }
    // Learning rows only lose their node when a node's visibility changes.
    if (ordered.some(record => visibilityChanged(record, states.get(record.object_id)!, hidden))) {
      await pruneLearningRowsWithoutVisibleNodes(tx);
    }
    return applied(ordered.map(record => record.object_id));
  });
}

async function hiddenParents(tx: DbPort, records: readonly NativeSyncNodeRecord[], states: ReadonlyMap<string, LocalState>) {
  const ids = new Set<string>();
  for (const record of records) {
    const state = states.get(record.object_id)!;
    if (!state.node_id || state.parent_id === record.snapshot.parent_id) continue;
    for (const id of [state.parent_id, record.snapshot.parent_id]) if (id) ids.add(id);
  }
  if (!ids.size) return new Map<string, boolean>();
  const rows = await tx.query<{ id: string; hidden: number }>(HIDDEN_PARENTS_SQL, [JSON.stringify([...ids])]);
  return new Map(rows.map(row => [row.id, Number(row.hidden) > 0]));
}

function visibilityChanged(record: NativeSyncNodeRecord, state: LocalState, hidden: ReadonlyMap<string, boolean>) {
  // A new node has no learning rows yet.
  if (!state.node_id) return false;
  if ((state.deleted_at ?? null) !== (record.snapshot.deleted_at ?? null)) return true;
  if (state.parent_id === record.snapshot.parent_id) return false;
  const isHidden = (id: string | null) => id !== null && (hidden.get(id) ?? true);
  return isHidden(state.parent_id) !== isHidden(record.snapshot.parent_id);
}
