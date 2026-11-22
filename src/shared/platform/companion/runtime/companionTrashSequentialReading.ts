import { loadCompanionWorkspaceNodesFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { maintainWorkspaceSnapshotSequentialReading } from '../../../../store/workspaceSnapshotSequentialReading';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { deriveCompanionWriteNodeOrder } from './companionWriteNodeOrder';
import { companionWriteNodeOrder, loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

type Nodes = Record<string, WorkspaceNodeSnapshot>;

/** Reads the nodes a batch Trash write consumes, falling back to the complete read when the narrow read cannot serve it. */
export async function loadCompanionBatchTrashNodes(db: DbPort, rootIds: readonly string[], host?: string) {
  const narrow = await loadCompanionWriteNodes(db, rootIds, { host, attachments: false, sequentialReading: true });
  const snapshot = narrow ? null : await loadIosCompanionWorkspaceSnapshot(db);
  // The narrow read holds every Sequential Reading source in reach and what maintaining it consumes.
  return { nodes: narrow ?? snapshot?.nodesById ?? {}, snapshot,
    nodeOrder: narrow ? companionWriteNodeOrder(narrow) : snapshot?.nodeOrder ?? null };
}

/**
 * Workspace reads hide the reading profile of trashed nodes, but a restored topic takes its stored profile back,
 * so Sequential Reading maintenance and the history entry must start from it.
 */
export async function withStoredTrashReadings(db: DbPort, nodes: Nodes, nodeIds: readonly string[], knownHost?: string) {
  const next = { ...nodes };
  const ids = nodeIds.filter(id => next[id]?.deletedAt && next[id]!.kind === 'topic');
  if (!ids.length) return next;
  // Every restored topic's stored profile is read in one statement.
  const stored = await loadCompanionWorkspaceNodesFromDb(db, ids, knownHost ?? await iosCompanionHostName(db));
  for (const id of ids) {
    const node = stored.get(id);
    if (node) next[id] = { ...next[id]!, reading: node.reading ?? null };
  }
  return next;
}

/**
 * Moving topics to or from Trash frees or retakes their Sequential Reading slots. A complete read plans from the
 * visible order the write produces; a narrow read lists membership only, with restored nodes appended.
 */
export async function maintainCompanionBatchTrashReading(db: DbPort,
  context: { nodes: Nodes; snapshot: WorkspaceSnapshot | null; nodeOrder: string[] | null }, after: Nodes,
  changedNodeIds: string[], now: string) {
  if (!context.nodeOrder || !changedNodeIds.length) return [];
  return maintainWorkspaceSnapshotSequentialReading({ before: context.nodes, after, changedNodeIds,
    nodeOrder: context.snapshot ? await deriveCompanionWriteNodeOrder(db, context.snapshot, after)
      : [...new Set([...context.nodeOrder, ...changedNodeIds])], now });
}
