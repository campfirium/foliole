import type { Node } from '../features/nodes/model/nodeTypes';
import {
  HOME_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  isHomeNode
} from '../features/nodes/model/specialNodes';

const BUILT_IN_VIRTUAL_BROWSE_ROOT_IDS = new Set([
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
]);

export function isWorkspaceBrowseRootNodeId(args: {
  browseRootNodeId: string;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  if (BUILT_IN_VIRTUAL_BROWSE_ROOT_IDS.has(args.browseRootNodeId)) {
    return true;
  }
  const node = args.nodesById[args.browseRootNodeId];
  return Boolean(
    node &&
    node.kind === 'folder' &&
    node.specialKind !== 'trash' &&
    !args.trashedNodeIds.includes(args.browseRootNodeId)
  );
}

export function resolveWorkspaceBrowseRootNodeId(args: {
  browseRootNodeId?: string | null | undefined;
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  return args.browseRootNodeId && isWorkspaceBrowseRootNodeId({
    browseRootNodeId: args.browseRootNodeId,
    nodesById: args.nodesById,
    trashedNodeIds: args.trashedNodeIds
  })
    ? args.browseRootNodeId
    : HOME_NODE_ID;
}

export type WorkspaceBrowseRootIntent = 'current-context' | 'target-context';

function resolvePhysicalBrowseRootNodeId(
  nodeId: string,
  nodesById: Record<string, Node>
) {
  const visited = new Set<string>();
  let cursorId: string | null = nodeId;
  while (cursorId && !visited.has(cursorId)) {
    visited.add(cursorId);
    const node: Node | undefined = nodesById[cursorId];
    if (!node) return HOME_NODE_ID;
    if (node.kind === 'folder') return node.id;
    cursorId = node.parentNodeId;
  }
  return HOME_NODE_ID;
}

function isTargetInCurrentBrowseRoot(args: {
  browseRootNodeId: string;
  nodesById: Record<string, Node>;
  targetNodeId: string;
}) {
  const browseRoot = args.nodesById[args.browseRootNodeId];
  if (args.browseRootNodeId === HOME_NODE_ID || isHomeNode(browseRoot)) return true;
  if (BUILT_IN_VIRTUAL_BROWSE_ROOT_IDS.has(args.browseRootNodeId)) return true;
  const visited = new Set<string>();
  let cursorId: string | null = args.targetNodeId;
  while (cursorId && !visited.has(cursorId)) {
    if (cursorId === args.browseRootNodeId) return true;
    visited.add(cursorId);
    cursorId = args.nodesById[cursorId]?.parentNodeId ?? null;
  }
  return false;
}

export function resolveWorkspaceBrowseRootForTarget(args: {
  browseRootNodeId: string;
  intent: WorkspaceBrowseRootIntent;
  nodesById: Record<string, Node>;
  targetNodeId: string;
  trashedNodeIds: string[];
}) {
  const target = args.nodesById[args.targetNodeId];
  if (!target || args.trashedNodeIds.includes(args.targetNodeId)) {
    return resolveWorkspaceBrowseRootNodeId(args);
  }
  if (target.kind === 'folder') return target.id;
  if (args.intent === 'current-context' && isTargetInCurrentBrowseRoot(args)) {
    return resolveWorkspaceBrowseRootNodeId(args);
  }
  return resolvePhysicalBrowseRootNodeId(args.targetNodeId, args.nodesById);
}
