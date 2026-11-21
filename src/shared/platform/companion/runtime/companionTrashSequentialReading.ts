import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { companionWriteNodeOrder, loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

type Nodes = Record<string, WorkspaceNodeSnapshot>;

/** Reads the nodes a batch Trash write consumes, falling back to the complete read when the narrow read cannot serve it. */
export async function loadCompanionBatchTrashNodes(db: DbPort, rootIds: readonly string[]) {
  const narrow = await loadCompanionWriteNodes(db, rootIds, { sequentialReading: true });
  const snapshot = narrow ? null : await loadIosCompanionWorkspaceSnapshot(db);
  // The narrow read holds every Sequential Reading source in reach and what maintaining it consumes.
  return { nodes: narrow ?? snapshot?.nodesById ?? {}, nodeOrder: narrow ? companionWriteNodeOrder(narrow) : snapshot?.nodeOrder ?? null };
}

/**
 * Workspace reads hide the reading profile of trashed nodes, but a restored topic takes its stored profile back,
 * so Sequential Reading maintenance and the history entry must start from it.
 */
export async function withStoredTrashReadings(db: DbPort, nodes: Nodes, nodeIds: readonly string[]) {
  const host = await iosCompanionHostName(db);
  const next = { ...nodes };
  for (const id of nodeIds) {
    const node = next[id];
    if (!node?.deletedAt || node.kind !== 'topic') continue;
    const stored = await loadCompanionWorkspaceNodeFromDb(db, id, host);
    if (stored) next[id] = { ...node, reading: stored.reading ?? null };
  }
  return next;
}

/**
 * Moving topics to or from Trash frees or retakes their Sequential Reading slots. Restored nodes are absent from
 * the visible order, so they are appended.
 */
export function maintainCompanionBatchTrashReading(context: { nodes: Nodes; nodeOrder: string[] | null },
  after: Nodes, changedNodeIds: string[], now: string) {
  if (!context.nodeOrder || !changedNodeIds.length) return [];
  return maintainWorkspaceSnapshotSequentialReading({ before: context.nodes, after, changedNodeIds,
    nodeOrder: [...new Set([...context.nodeOrder, ...changedNodeIds])], now });
}
