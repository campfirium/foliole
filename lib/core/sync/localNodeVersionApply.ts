import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { initializeReceivedReviewSchedule } from '../database/initialReviewSchedule.js';
import { recomputeNodeReviewWithDb } from '../database/reviewProjection.js';

import type { DbPort } from './dbPort.js';
import { writeDbStatements, type DbStatement } from './dbStatements.js';
import { repairDirectChildAnchorsForAppliedParent } from './syncNodeAnchorRepair.js';
import { localOriginStatements } from './syncNodeAppliedMutationState.js';
import { applySyncNodesWithDbPort, type ApplySyncNodesWithDbPortResult } from './syncNodeApplyExecutor.js';
import { decideIncomingNodeApply, orderNodesForApply } from './syncNodeApplyRules.js';
import { buildRemoteNodeUpdate, buildRemoteNodeUpsert, buildRemoteNodeVersionUpsert, remoteNodeColumnValues } from './syncNodeApplyStatements.js';
import { prepareSyncNodeTextBodyHashes } from './syncNodePreparedTextBodyHashes.js';
import { appliedNodeSyncStateStatement } from './syncNodeStateApplyExecutor.js';
import { assertSyncNodeTextWithinBudget } from './syncNodeTextBudget.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

export type LocalNodeVersionOperation = 'local_mutation' | 'local_restore';

/** The node's own `nodes` row (absent for a new node) plus every fact the local path checks before writing. */
export type LocalNodeVersionState = Record<string, unknown> & {
  local_record_id: string; node_id: string | null; current_version_id: string | null; deleted_at: string | null;
  parent_id: string | null; sync_dirty: number | null; tombstoned: number; parent_tombstoned: number; version_stored: number;
  parent_version_stored: number; state_base: string | null; state_content: string | null; state_dirty: number | null;
  has_state: number; old_parent_hidden: number | null; new_parent_hidden: number | null; anchored_children: number;
};

// One read gives every fact the remote apply chain would otherwise read per record: the node, its tombstone,
// the new parent's tombstone, whether the version or its parent version is stored, the node's sync state, whether
// the old and new parents of a moved node are visible (every node up to a root exists and is not deleted, as in the
// visible-nodes CTE) and whether the node has anchored children to repair.
const LOCAL_STATE_SQL = `WITH RECURSIVE r(id, parent_id, version_id, parent_version_id) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]')
  FROM json_each(?)
), starts(id) AS (
  SELECT n.parent_id FROM r JOIN nodes n ON n.id = r.id WHERE n.parent_id IS NOT NULL AND n.parent_id IS NOT r.parent_id
  UNION SELECT r.parent_id FROM r JOIN nodes n ON n.id = r.id WHERE r.parent_id IS NOT NULL AND n.parent_id IS NOT r.parent_id
), chain(start, id, depth) AS (
  SELECT id, id, 0 FROM starts
  UNION ALL SELECT chain.start, node.parent_id, chain.depth + 1 FROM chain JOIN nodes node ON node.id = chain.id
  WHERE node.parent_id IS NOT NULL AND chain.depth < 100000
), hidden(id, hidden) AS (
  SELECT chain.start, SUM(node.id IS NULL OR node.deleted_at IS NOT NULL) FROM chain LEFT JOIN nodes node ON node.id = chain.id
  GROUP BY chain.start
) SELECT n.*, r.id AS local_record_id, n.id AS node_id,
  EXISTS (SELECT 1 FROM node_sync_tombstones t WHERE t.node_id = r.id) AS tombstoned,
  (r.parent_id IS NOT NULL AND EXISTS (SELECT 1 FROM node_sync_tombstones t WHERE t.node_id = r.parent_id)) AS parent_tombstoned,
  EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = r.version_id) AS version_stored,
  (r.parent_version_id IS NULL OR EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = r.parent_version_id)) AS parent_version_stored,
  s.base_content_hash AS state_base, s.content_hash AS state_content, s.sync_dirty AS state_dirty, s.object_id IS NOT NULL AS has_state,
  (SELECT h.hidden FROM hidden h WHERE h.id = n.parent_id) AS old_parent_hidden,
  (SELECT h.hidden FROM hidden h WHERE h.id = r.parent_id) AS new_parent_hidden,
  EXISTS (SELECT 1 FROM nodes child WHERE child.parent_id = r.id AND child.deleted_at IS NULL AND child.anchor_link IS NOT NULL) AS anchored_children
FROM r LEFT JOIN nodes n ON n.id = r.id
LEFT JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = r.id`;

/** Reads what storing `records` through the local path checks, keyed by node id, in one statement. */
export async function readLocalNodeVersionStates(port: DbPort, records: readonly NativeSyncNodeRecord[]) {
  const rows = await port.query<LocalNodeVersionState>(LOCAL_STATE_SQL, [JSON.stringify(records.map(record =>
    [record.object_id, record.snapshot.parent_id, record.version_id, record.parent_version_id ?? null]))]);
  return new Map(rows.map(row => [row.local_record_id, row]));
}

export type LocalNodeVersionApplyResult = ApplySyncNodesWithDbPortResult & {
  /** Each stored node's `nodes` row as the local path left it; absent when the remote apply chain stored the records. */
  rows?: ReadonlyMap<string, Record<string, unknown>>;
};

function eligible(record: NativeSyncNodeRecord) {
  return !record.is_tombstone && Boolean(record.version_id && record.host_name && record.version_created_at);
}

function applied(ids: string[]): ApplySyncNodesWithDbPortResult {
  return { appliedIds: ids, workspaceScopeExpanded: false, workspaceStructureChanged: true, anchorRepairRecords: [], blockedIds: [],
    conflictRecords: [], conflictNodes: [], skippedConflictCopyIds: [], tombstoneBlockedIds: [], unmappedAnchorRecords: [] };
}

function localNodeVersionsEligible(records: readonly NativeSyncNodeRecord[]) {
  return records.every(eligible) && new Set(records.map(record => record.object_id)).size === records.length;
}

/**
 * Whether the local path stores `records` itself: each is built on its node's current version (or creates a node),
 * nothing is tombstoned and the version is new. `states` comes from `readLocalNodeVersionStates`.
 */
export function localNodeVersionsReady(records: readonly NativeSyncNodeRecord[],
  states: ReadonlyMap<string, LocalNodeVersionState>, operation: LocalNodeVersionOperation) {
  if (!localNodeVersionsEligible(records)) return false;
  return records.every(record => {
    const state = states.get(record.object_id);
    if (!state || state.tombstoned || state.parent_tombstoned || state.version_stored || !state.parent_version_stored) return false;
    const local = state.node_id ? { current_version_id: state.current_version_id, deleted_at: state.deleted_at,
      sync_dirty: state.sync_dirty ?? 0 } : null;
    if ((local?.current_version_id ?? null) !== (record.parent_version_id ?? null)) return false;
    const decision = decideIncomingNodeApply(local, record, operation);
    return decision === 'apply_fast_forward' || decision === 'apply_missing_local';
  });
}

/**
 * Stores versions this host has just built on top of each node's current version. The remote apply chain validates
 * incoming dependencies, guards tombstones and decides conflicts for records from another host; a local record whose
 * parent is the current version needs none of that, so its writes go out in one batch after a single read.
 * Records outside that shape keep the remote apply chain unchanged.
 */
export async function applyLocalNodeVersionsWithDbPort(port: DbPort, records: NativeSyncNodeRecord[],
  operation: LocalNodeVersionOperation, read?: ReadonlyMap<string, LocalNodeVersionState>): Promise<LocalNodeVersionApplyResult> {
  const legacy = (db: DbPort) => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false, includeAlreadyApplied: true, operation });
  if (!records.length) return applied([]);
  if (!localNodeVersionsEligible(records)) return legacy(port);
  for (const record of records) assertSyncNodeTextWithinBudget(record.snapshot);
  // A new node's body hash is computed here, outside the transaction, as the remote apply chain does.
  const hashes = await prepareSyncNodeTextBodyHashes(records, {});
  const ordered = orderNodesForApply([...records]);
  // The states are read before any transaction opens, as the remote apply chain validates before its own, so a
  // record the local path cannot store reaches that chain untouched. Phone writes run one at a time in the writer
  // queue; a caller that already read the states in its transaction passes them in.
  const states = read ?? await readLocalNodeVersionStates(port, ordered);
  if (!localNodeVersionsReady(ordered, states, operation)) return legacy(port);
  return port.transaction(async tx => {
    const statements: DbStatement[] = [];
    const stored = new Map<string, Record<string, unknown>>();
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
      stored.set(record.object_id, { ...(state.node_id ? nodeColumns(state) : {}), ...remoteNodeColumnValues(record, hash, 0) });
      statements.push(...localOriginStatements(record.version_id));
      const baseContentHash = state.has_state ? (state.state_dirty === 1 ? state.state_base ?? state.state_content
        : state.state_content) : null;
      statements.push(appliedNodeSyncStateStatement(record, { baseContentHash, syncDirty: 1 }));
    }
    await writeDbStatements(tx, statements);
    // An Item's initial review schedule travels with its version and is initialized as the remote apply chain does.
    for (const record of ordered) {
      if (await initializeReceivedReviewSchedule(tx, record.object_id, record.snapshot.initial_review_due)) {
        await recomputeNodeReviewWithDb(tx, record.object_id);
      }
    }
    const batch = new Set(ordered.map(record => record.object_id));
    for (const record of ordered) {
      const content = record.body_text ?? record.snapshot.content;
      if (record.snapshot.deleted_at || typeof content !== 'string' || !states.get(record.object_id)!.anchored_children) continue;
      await repairDirectChildAnchorsForAppliedParent({ content, excludedNodeIds: batch, parentNodeId: record.object_id,
        port: tx, sourceVersionId: record.version_id, updatedAt: record.snapshot.updated_at });
    }
    // Learning rows only lose their node when a node's visibility changes.
    if (ordered.some(record => visibilityChanged(record, states.get(record.object_id)!))) {
      await pruneLearningRowsWithoutVisibleNodes(tx);
    }
    return { ...applied(ordered.map(record => record.object_id)), rows: stored };
  });
}

const STATE_COLUMNS = new Set(['local_record_id', 'node_id', 'tombstoned', 'parent_tombstoned', 'version_stored',
  'parent_version_stored', 'state_base', 'state_content', 'state_dirty', 'has_state', 'old_parent_hidden', 'new_parent_hidden',
  'anchored_children']);

/** The `nodes` row inside a state read. */
export function nodeColumns(state: LocalNodeVersionState) {
  return Object.fromEntries(Object.entries(state).filter(([column]) => !STATE_COLUMNS.has(column)));
}

function visibilityChanged(record: NativeSyncNodeRecord, state: LocalNodeVersionState) {
  // A new node has no learning rows yet.
  if (!state.node_id) return false;
  if ((state.deleted_at ?? null) !== (record.snapshot.deleted_at ?? null)) return true;
  if (state.parent_id === record.snapshot.parent_id) return false;
  // A parent that does not exist hides its children.
  const isHidden = (id: string | null, hidden: number | null) => id !== null && (hidden === null || Number(hidden) > 0);
  return isHidden(state.parent_id, state.old_parent_hidden) !== isHidden(record.snapshot.parent_id, state.new_parent_hidden);
}
