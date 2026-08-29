import type { BrowserWindow } from 'electron';

import type { NativeNodeSnapshotArgs } from '../../lib/platform/nativeStorageContract.js';

import type { parseNodeAnchorLocatorUpdateArray, parseNodeCreationMutationArgs } from './commandParsers.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export type OriginWindow = BrowserWindow | null;

export function completeWorkspaceMutation(result: unknown = null, originWindow: OriginWindow = null) {
  notifyWorkspaceContentChanged(originWindow);
  return result;
}

export function buildNodeMutationPatchResult(args: {
  activeNodeId?: string | null;
  anchorUpdates?: ReturnType<typeof parseNodeAnchorLocatorUpdateArray>;
  createdNodeIds?: string[];
  collectionRenames?: Array<{ from: string; nodeIds: string[]; to: string }>;
  nodeOrder?: string[];
  nodes: NativeNodeSnapshotArgs[];
  originWindow?: OriginWindow;
  updatedNodeIds?: string[];
}) {
  return completeWorkspaceMutation({
    ...(args.activeNodeId !== undefined ? { activeNodeId: args.activeNodeId } : {}),
    ...(args.anchorUpdates ? { anchorUpdates: args.anchorUpdates } : {}),
    ...(args.createdNodeIds ? { createdNodeIds: args.createdNodeIds } : {}),
    ...(args.collectionRenames ? { collectionRenames: args.collectionRenames } : {}),
    ...(args.nodeOrder ? { nodeOrder: args.nodeOrder } : {}),
    nodes: args.nodes,
    ...(args.updatedNodeIds ? { updatedNodeIds: args.updatedNodeIds } : {})
  }, args.originWindow);
}

export function completeCreatedNodeCreation(
  parsed: ReturnType<typeof parseNodeCreationMutationArgs>,
  originWindow: OriginWindow
) {
  return buildNodeMutationPatchResult({
    activeNodeId: parsed.activeNodeId,
    createdNodeIds: [parsed.node.nodeId],
    nodeOrder: parsed.nodeOrder,
    nodes: [parsed.node],
    originWindow
  });
}
