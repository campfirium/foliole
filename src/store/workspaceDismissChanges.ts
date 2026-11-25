import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildDismissedReadingProfile } from './workspaceReviewReading';
import { buildSequentialReadingDismissPatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

export interface WorkspaceDismissReadingChange {
  afterReading: Node['reading'];
  beforeReading: Node['reading'];
  nodeId: string;
}

type DismissState = Pick<WorkspaceState, 'nodesById' | 'nodeOrder'> & Partial<Pick<WorkspaceState, 'trashedNodeIds'>>;
type DismissNode = Parameters<typeof hasNodeContent>[0] & Parameters<typeof isReadingReviewItemNode>[0] &
  Parameters<typeof isProtectedRootNode>[0] & { reading?: { state?: string } | null };

/** A node Dismiss takes out of learning: a reading topic with content that is not dismissed yet. */
export function canDismissWorkspaceNode(node: DismissNode | null | undefined) {
  return Boolean(node && !isProtectedRootNode(node) && hasNodeContent(node) &&
    isReadingReviewItemNode(node) && node.reading?.state !== 'dismissed');
}

function buildSingleDismissMutation(nodeId: string, now: string, state: DismissState) {
  const node = state.nodesById[nodeId];
  if (!node || !canDismissWorkspaceNode(node)) return null;
  const defaultPriority = getCurrentReviewSchedulerSettings().pushQueue.defaultPriority;
  const afterReading = buildDismissedReadingProfile({
    currentNodeId: nodeId,
    currentReading: node.reading,
    defaultPriority,
    nodesById: state.nodesById,
    now
  });
  const nextNodesById = { ...state.nodesById, [nodeId]: { ...node, reading: afterReading } };
  const sequentialPatch = buildSequentialReadingDismissPatch({
    defaultPriority,
    dismissedNodeId: nodeId,
    nodeOrder: state.nodeOrder,
    nodesById: nextNodesById,
    now,
    trashedNodeIds: state.trashedNodeIds
  });
  return {
    changes: [{ afterReading, beforeReading: node.reading, nodeId }, ...(sequentialPatch?.changes ?? [])],
    nodesById: sequentialPatch?.nodesById ?? nextNodesById
  };
}

/**
 * Dismisses each eligible node in turn, keeping Sequential Reading in step after every one, and returns one
 * reading change per node touched (its reading before the first change and after the last) with the final nodes.
 */
export function collectWorkspaceDismissChanges(args: { nodeIds: readonly string[]; now: string; state: DismissState }) {
  const changesByNodeId = new Map<string, WorkspaceDismissReadingChange>();
  let nodesById = args.state.nodesById;
  for (const nodeId of new Set(args.nodeIds)) {
    const mutation = buildSingleDismissMutation(nodeId, args.now, { ...args.state, nodesById });
    if (!mutation) continue;
    nodesById = mutation.nodesById;
    for (const change of mutation.changes) {
      const existing = changesByNodeId.get(change.nodeId);
      changesByNodeId.set(change.nodeId, {
        afterReading: change.afterReading,
        beforeReading: existing ? existing.beforeReading : change.beforeReading,
        nodeId: change.nodeId
      });
    }
  }
  return { changes: [...changesByNodeId.values()], nodesById };
}
