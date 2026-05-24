import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  deleteNodesPermanently,
  flushAllDirtyNodeSyncVersions,
  moveNodes,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  updateNodeAnchorLinks,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import {
  parseNodeAnchorLocatorUpdateArray,
  asStringArray,
  parseNodeCreationArgs,
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

export function handleNodeMutationCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.createFolder) {
    const parsed = parseNodeCreationArgs(args, 'folder');
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return completeWorkspaceMutation();
  }
  if (command === NATIVE_COMMANDS.createTopic) {
    const parsed = parseNodeCreationArgs(args, 'topic');
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return completeWorkspaceMutation();
  }
  if (command === NATIVE_COMMANDS.createItem) {
    const parsed = parseNodeCreationArgs(args, 'item');
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return completeWorkspaceMutation();
  }
  if (command === NATIVE_COMMANDS.updateNodeContent || command === NATIVE_COMMANDS.updateNodeReveal) {
    const parsed = parseNodeSnapshotArgs(args);
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return completeWorkspaceMutation();
  }
  if (command === NATIVE_COMMANDS.updateNodeContentWithAnchors) {
    const parent = parseNodeSnapshotArgs(readObjectArg(args.parent, 'parent'));
    const affectedAnchors = parseNodeAnchorLocatorUpdateArray(args.affectedAnchors, 'affectedAnchors');
    upsertNodeSnapshot(parent);
    updateNodeAnchorLinks(affectedAnchors);
    scheduleMirrorSync([parent.nodeId, ...affectedAnchors.map((node) => node.nodeId)]);
    return completeWorkspaceMutation();
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
