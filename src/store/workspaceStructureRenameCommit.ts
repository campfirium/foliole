import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import { syncNodeContentMutationToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createStructureRenameEntry, isWorkspaceStructureKind } from './workspaceStructureHistoryEntries';

function preserveCurrentNodeBody(
  current: WorkspaceState['nodesById'][string] | undefined,
  next: WorkspaceState['nodesById'][string]
) {
  if (!current) return next;
  return {
    ...next,
    content: current.content,
    ...(current.hasContent === undefined ? {} : { hasContent: current.hasContent })
  };
}

export function preserveCurrentBodyInPatch(
  state: WorkspaceState,
  nodeId: string,
  patch: Partial<WorkspaceState>
): Partial<WorkspaceState> {
  const nextNode = patch.nodesById?.[nodeId];
  if (!nextNode || !patch.nodesById) return patch;
  return {
    ...patch,
    nodesById: { ...patch.nodesById, [nodeId]: preserveCurrentNodeBody(state.nodesById[nodeId], nextNode) }
  };
}

export function buildCommittedTitleMutation(args: {
  beforeTitle: string | null;
  localPatch: Partial<WorkspaceState> | null;
  nextNodeForSync: WorkspaceState['nodesById'][string];
  nodeId: string;
  result: Awaited<ReturnType<typeof syncNodeContentMutationToRuntime>>;
  shouldUseLocalFallback: boolean;
  state: WorkspaceState;
}) {
  const acceptedPatch = args.result?.updatedNodeIds?.includes(args.nodeId)
    ? createWorkspaceNodeMutationPatch(args.state, args.result)
    : args.shouldUseLocalFallback ? args.localPatch : null;
  if (!acceptedPatch || args.state.nodesById[args.nodeId]?.title !== args.beforeTitle) return null;
  const patch = preserveCurrentBodyInPatch(args.state, args.nodeId, acceptedPatch);
  const acceptedNode = patch.nodesById?.[args.nodeId];
  if (!acceptedNode) return null;
  const entry = args.beforeTitle && isWorkspaceStructureKind(acceptedNode.kind)
    ? createStructureRenameEntry({
        afterTitle: acceptedNode.title,
        beforeTitle: args.beforeTitle,
        kind: acceptedNode.kind,
        nodeId: args.nodeId
      })
    : null;
  const nodesToCache = args.result
    ? args.result.nodes.flatMap((snapshot) => patch.nodesById?.[snapshot.nodeId]
        ? [patch.nodesById[snapshot.nodeId]!]
        : [])
    : [args.nextNodeForSync];
  return {
    nodesToCache,
    patch: { ...patch, ...(entry ? { appActionHistory: pushWorkspaceUndoEntry(args.state.appActionHistory, entry) } : {}) }
  };
}
