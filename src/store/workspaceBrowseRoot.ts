import type { Node } from '../features/nodes/model/nodeTypes';
import {
  HOME_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
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
