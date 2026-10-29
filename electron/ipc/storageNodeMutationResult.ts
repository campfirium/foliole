import type { BrowserWindow } from 'electron';

import type { WorkspaceRefreshScope } from '../../lib/core/database/workspaceSnapshotRefresh.js';
import type { NativeNodeSnapshotArgs } from '../../lib/platform/nativeStorageContract.js';

import type { parseNodeAnchorLocatorUpdateArray, parseNodeCreationMutationArgs } from './commandParsers.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

export type OriginWindow = BrowserWindow | null;

export function completeWorkspaceMutation(result: unknown = null, originWindow: OriginWindow = null,
  workspaceScope: WorkspaceRefreshScope = { kind: 'full' }, libraryScope?: string) {
  notifyWorkspaceContentChanged(originWindow, { workspaceScope, ...(libraryScope ? { libraryScope } : {}) });
  return result;
}

export function buildNodeMutationPatchResult(args: {
  workspaceScope?: WorkspaceRefreshScope;
  libraryScope?: string;
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
  }, args.originWindow, args.workspaceScope, args.libraryScope);
}

export function completeCreatedNodeCreation(
  parsed: ReturnType<typeof parseNodeCreationMutationArgs>,
  originWindow: OriginWindow,
  currentVersionId?: string | null
) {
  return buildNodeMutationPatchResult({
    activeNodeId: parsed.activeNodeId,
    createdNodeIds: [parsed.node.nodeId],
    nodes: [{ ...parsed.node, ...(currentVersionId ? { currentVersionId } : {}) }],
    originWindow
  });
}
