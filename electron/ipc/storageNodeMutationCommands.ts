import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  deleteNodesPermanently,
  flushAllDirtyNodeSyncVersions,
  moveNodes,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  updateNodeAnchorLinks,
  upsertNodeSnapshot,
  upsertNodeSnapshotWithOrder
} from '../database/nodeMutations.js';
import { enqueueCoalescedWorkspaceSearchInvalidation } from '../database/searchIndexInvalidationCoalescer.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import {
  parseNodeAnchorLocatorUpdateArray,
  asStringArray,
  parseNodeCreationMutationArgs,
  parseNodeSnapshotArgs
} from './commandParsers.js';
import {
  parseDeleteNodesPermanentlyArgs,
  parseMoveNodesArgs,
  parseRestoreNodesArgs,
  parseSoftDeleteNodesArgs
} from './nodeCommandArgs.js';
import { readObjectArg } from './storageCommandSupport.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

function completeWorkspaceMutation(result: unknown = null) {
  notifyWorkspaceContentChanged();
  return result;
}

function buildNodeMutationPatchResult(args: {
  activeNodeId?: string | null;
  anchorUpdates?: ReturnType<typeof parseNodeAnchorLocatorUpdateArray>;
  createdNodeIds?: string[];
  nodeOrder?: string[];
  nodes: ReturnType<typeof parseNodeSnapshotArgs>[];
  updatedNodeIds?: string[];
}) {
  return completeWorkspaceMutation({
    ...(args.activeNodeId !== undefined ? { activeNodeId: args.activeNodeId } : {}),
    ...(args.anchorUpdates ? { anchorUpdates: args.anchorUpdates } : {}),
    ...(args.createdNodeIds ? { createdNodeIds: args.createdNodeIds } : {}),
    ...(args.nodeOrder ? { nodeOrder: args.nodeOrder } : {}),
    nodes: args.nodes,
    ...(args.updatedNodeIds ? { updatedNodeIds: args.updatedNodeIds } : {})
  });
}

function handleCreateNodeCommand(args: Record<string, unknown>, kind: 'folder' | 'topic' | 'item') {
  const parsed = parseNodeCreationMutationArgs(args, kind);
  upsertNodeSnapshotWithOrder(parsed.node, parsed.nodeOrder);
  scheduleMirrorSync([parsed.node.nodeId]);
  return buildNodeMutationPatchResult({
    activeNodeId: parsed.activeNodeId,
    createdNodeIds: [parsed.node.nodeId],
    nodeOrder: parsed.nodeOrder,
    nodes: [parsed.node]
  });
}

function handleSoftDeleteNodeCommand(args: Record<string, unknown>) {
  const parsed = parseSoftDeleteNodesArgs(args);
  softDeleteNodes(parsed);
  scheduleMirrorSync(parsed.nodeIds);
  return completeWorkspaceMutation({ deletedNodeIds: parsed.nodeIds });
}

function handlePermanentDeleteNodeCommand(args: Record<string, unknown>) {
  const parsed = parseDeleteNodesPermanentlyArgs(args);
  const affectedParentNodeIds = deleteNodesPermanently(parsed);
  const removedNodeIds = parsed.nodeIds;
  scheduleMirrorSync([...new Set([...removedNodeIds, ...affectedParentNodeIds])]);
  return completeWorkspaceMutation({ nodeOrder: parsed.nodeOrder, removedNodeIds });
}

function handleNodeContentWithAnchorsCommand(args: Record<string, unknown>) {
  const parent = parseNodeSnapshotArgs(readObjectArg(args.parent, 'parent'));
  const affectedAnchors = parseNodeAnchorLocatorUpdateArray(args.affectedAnchors, 'affectedAnchors');
  upsertNodeSnapshot(parent);
  updateNodeAnchorLinks(affectedAnchors);
  scheduleMirrorSync([parent.nodeId, ...affectedAnchors.map((node) => node.nodeId)]);
  return buildNodeMutationPatchResult({
    anchorUpdates: affectedAnchors,
    nodes: [parent],
    updatedNodeIds: [parent.nodeId, ...affectedAnchors.map((node) => node.nodeId)]
  });
}

export function handleNodeMutationCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.createFolder) {
    return handleCreateNodeCommand(args, 'folder');
  }
  if (command === NATIVE_COMMANDS.createTopic) {
    return handleCreateNodeCommand(args, 'topic');
  }
  if (command === NATIVE_COMMANDS.createItem) {
    return handleCreateNodeCommand(args, 'item');
  }
  if (command === NATIVE_COMMANDS.updateNodeContent || command === NATIVE_COMMANDS.updateNodeReveal) {
    const parsed = parseNodeSnapshotArgs(args);
    upsertNodeSnapshot(parsed, { searchInvalidation: { workspaceInvalidation: 'defer' } });
    enqueueCoalescedWorkspaceSearchInvalidation([parsed.nodeId]);
    scheduleMirrorSync([parsed.nodeId]);
    return buildNodeMutationPatchResult({
      nodes: [parsed],
      updatedNodeIds: [parsed.nodeId]
    });
  }
  if (command === NATIVE_COMMANDS.updateNodeContentWithAnchors) {
    return handleNodeContentWithAnchorsCommand(args);
  }
  if (command === NATIVE_COMMANDS.flushDirtyNodeSyncVersions) {
    return flushAllDirtyNodeSyncVersions();
  }
  if (command === NATIVE_COMMANDS.replaceNodeOrder) {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return completeWorkspaceMutation();
  }
  if (command === NATIVE_COMMANDS.moveNodes) {
    const result = moveNodes(parseMoveNodesArgs(args));
    scheduleMirrorSync(result.movedNodeIds);
    return completeWorkspaceMutation(result);
  }
  if (command === NATIVE_COMMANDS.softDeleteNodes) {
    return handleSoftDeleteNodeCommand(args);
  }
  if (command === NATIVE_COMMANDS.restoreNodes) {
    const parsed = parseRestoreNodesArgs(args);
    const result = restoreNodes(parsed);
    scheduleMirrorSync(result.restoredNodeIds);
    return completeWorkspaceMutation(result);
  }
  if (command === NATIVE_COMMANDS.deleteNodesPermanently) {
    return handlePermanentDeleteNodeCommand(args);
  }
  return undefined;
}
