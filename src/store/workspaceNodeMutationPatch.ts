import type { Node, NodeAnchorLink } from '../features/nodes/model/nodeTypes';
import type {
  WorkspaceNodeMutationPatchResult,
  WorkspaceRuntimeNodeSnapshot
} from '../shared/platform/workspaceRuntimeTypes';

import { shouldKeepLocalNodeContent } from './workspaceNodeContentVersionGuard';
import type { WorkspaceState } from './workspaceStore';

type WorkspacePatch = Partial<Pick<WorkspaceState, 'activeNodeId' | 'nodeOrder' | 'nodesById'>>;

function nodeFromSnapshot(snapshot: WorkspaceRuntimeNodeSnapshot, current?: Node): Node {
  return {
    id: snapshot.nodeId,
    parentNodeId: snapshot.parentNodeId,
    kind: snapshot.kind,
    ...(current?.specialKind ? { specialKind: current.specialKind } : {}),
    priority: snapshot.priority ?? null,
    desiredRetention: snapshot.desiredRetention ?? null,
    enableShortTerm: snapshot.enableShortTerm ?? null,
    sequentialReadingEnabled: snapshot.sequentialReadingEnabled ?? null,
    shelvedAt: snapshot.shelvedAt ?? null,
    manualChildOrder: snapshot.kind === 'folder' ? snapshot.manualChildOrder ?? null : null,
    title: snapshot.title,
    isTitleManual: snapshot.isTitleManual,
    hideTitleHeading: snapshot.hideTitleHeading ?? false,
    hasContent: snapshot.content.trim().length > 0,
    hasReveal: snapshot.reveal !== null,
    content: snapshot.content,
    virtualFilter: snapshot.virtualFilter ?? null,
    reveal: snapshot.reveal,
    anchorLink: snapshot.anchorLink as NodeAnchorLink | null,
    imageRegions: snapshot.imageRegions as Node['imageRegions'] ?? null,
    reading: snapshot.reading ?? null,
    review: snapshot.review ?? null,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt
  };
}

function mergeRuntimeNodePatch(current: Node | undefined, next: Node): Node {
  if (!current) {
    return next;
  }
  if (next.updatedAt < current.updatedAt) {
    return current;
  }
  if (current.content.trim().length > 0 && next.content.trim().length === 0) {
    return {
      ...next,
      content: current.content,
      hasContent: true
    };
  }
  if (!shouldKeepLocalNodeContent({
    currentUpdatedAt: current.updatedAt,
    incomingUpdatedAt: next.updatedAt,
    nodeId: next.id
  })) {
    return next;
  }
  return {
    ...next,
    content: current.content,
    hasContent: current.hasContent ?? current.content.trim().length > 0
  };
}

function mergeNodeWithLocalUserFields(runtimeNode: Node | undefined, localNode: Node): Node {
  if (!runtimeNode) {
    return localNode;
  }
  const title = localNode.isTitleManual || runtimeNode.title.trim().length === 0
    ? localNode.title
    : runtimeNode.title;
  const merged = {
    ...runtimeNode,
    ...(localNode.specialKind ? { specialKind: localNode.specialKind } : {}),
    title,
    isTitleManual: localNode.isTitleManual ?? runtimeNode.isTitleManual ?? false,
    content: localNode.content,
    reveal: localNode.reveal,
    anchorLink: localNode.anchorLink ?? null,
    imageRegions: localNode.imageRegions ?? null
  };
  return {
    ...merged,
    hasContent: merged.content.trim().length > 0,
    hasReveal: merged.reveal !== null
  };
}

function mergeNodesByIdWithLocalUserFields(
  runtimeNodesById: WorkspaceState['nodesById'] | undefined,
  localNodesById: WorkspaceState['nodesById'] | undefined,
  nodeIds: ReadonlySet<string>
) {
  const nextNodesById = { ...runtimeNodesById };
  if (!localNodesById) {
    return nextNodesById;
  }
  for (const nodeId of nodeIds) {
    const localNode = localNodesById[nodeId];
    if (localNode) {
      nextNodesById[nodeId] = mergeNodeWithLocalUserFields(nextNodesById[nodeId], localNode);
    }
  }
  return nextNodesById;
}

export function createWorkspaceNodeMutationPatch(
  state: Pick<WorkspaceState, 'nodesById'>,
  result: WorkspaceNodeMutationPatchResult
): WorkspacePatch {
  const nextNodesById = { ...state.nodesById };
  for (const snapshot of result.nodes) {
    const nextNode = nodeFromSnapshot(snapshot, state.nodesById[snapshot.nodeId]);
    nextNodesById[nextNode.id] = mergeRuntimeNodePatch(nextNodesById[nextNode.id], nextNode);
  }
  for (const update of result.anchorUpdates ?? []) {
    const current = nextNodesById[update.nodeId];
    if (current && update.updatedAt >= current.updatedAt) {
      nextNodesById[update.nodeId] = {
        ...current,
        anchorLink: update.anchorLink as NodeAnchorLink,
        imageRegions: update.imageRegions as Node['imageRegions'] ?? null,
        updatedAt: update.updatedAt
      };
    }
  }
  return {
    ...(result.activeNodeId !== undefined ? { activeNodeId: result.activeNodeId } : {}),
    ...(result.nodeOrder ? { nodeOrder: [...result.nodeOrder] } : {}),
    nodesById: nextNodesById
  };
}

export function createWorkspaceNodeMutationPatchWithLocalSideEffects(
  state: Pick<WorkspaceState, 'nodesById'>,
  result: WorkspaceNodeMutationPatchResult,
  localPatch: Partial<WorkspaceState> | null
): WorkspacePatch & Partial<WorkspaceState> {
  const localUserNodesById = localPatch?.nodesById
    ? {
        ...localPatch.nodesById,
        ...state.nodesById
      }
    : state.nodesById;
  const runtimeBaseState = localPatch?.nodesById
    ? {
        ...state,
        nodesById: {
          ...localPatch.nodesById,
          ...state.nodesById
        }
      }
    : state;
  const runtimePatch = createWorkspaceNodeMutationPatch(runtimeBaseState, result);
  if (!localPatch) return runtimePatch;
  return {
    ...localPatch,
    ...runtimePatch,
    nodesById: mergeNodesByIdWithLocalUserFields(
      runtimePatch.nodesById,
      localUserNodesById,
      new Set(result.nodes.map((node) => node.nodeId))
    )
  };
}
