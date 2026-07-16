import type { BrowserWindow } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeNodeSnapshotArgs } from '../../lib/platform/nativeStorageContract.js';
import { renameCollectionVirtualFolder } from '../agentControl/agentControlVirtualFolderLifecycle.js';
import { readCollectionVirtualFolderRow } from '../agentControl/agentControlVirtualFolders.js';
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

type OriginWindow = BrowserWindow | null;

function completeWorkspaceMutation(result: unknown = null, originWindow: OriginWindow = null) {
  notifyWorkspaceContentChanged(originWindow);
  return result;
}

function readNowMs() {
  return performance.now();
}

function readElapsedMs(startedAt: number) {
  return readNowMs() - startedAt;
}

function buildNodeMutationPatchResult(args: {
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

function buildNodeContentWithAnchorsResult(args: {
  affectedAnchors: ReturnType<typeof parseNodeAnchorLocatorUpdateArray>;
  diagnostics: Record<string, number>;
  originWindow: OriginWindow;
  parent: ReturnType<typeof parseNodeSnapshotArgs>;
  totalStartedAt: number;
}) {
  const startedAt = readNowMs();
  const result = buildNodeMutationPatchResult({
    anchorUpdates: args.affectedAnchors,
    nodes: [args.parent],
    originWindow: args.originWindow,
    updatedNodeIds: [args.parent.nodeId, ...args.affectedAnchors.map((node) => node.nodeId)]
  });
  args.diagnostics.buildResultMs = readElapsedMs(startedAt);
  args.diagnostics.totalMs = readElapsedMs(args.totalStartedAt);
  return { ...(result as object), diagnostics: args.diagnostics };
}

function handleCreateNodeCommand(args: Record<string, unknown>, kind: 'folder' | 'topic' | 'item', originWindow: OriginWindow) {
  const parsed = parseNodeCreationMutationArgs(args, kind);
  upsertNodeSnapshotWithOrder(parsed.node, parsed.nodeOrder);
  scheduleMirrorSync([parsed.node.nodeId]);
  return buildNodeMutationPatchResult({
    activeNodeId: parsed.activeNodeId,
    createdNodeIds: [parsed.node.nodeId],
    nodeOrder: parsed.nodeOrder,
    nodes: [parsed.node],
    originWindow
  });
}

function handleSoftDeleteNodeCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const parsed = parseSoftDeleteNodesArgs(args);
  softDeleteNodes(parsed);
  scheduleMirrorSync(parsed.nodeIds);
  return completeWorkspaceMutation({ deletedNodeIds: parsed.nodeIds }, originWindow);
}

function handlePermanentDeleteNodeCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const parsed = parseDeleteNodesPermanentlyArgs(args);
  const affectedParentNodeIds = deleteNodesPermanently(parsed);
  const removedNodeIds = parsed.nodeIds;
  scheduleMirrorSync([...new Set([...removedNodeIds, ...affectedParentNodeIds])]);
  return completeWorkspaceMutation({ nodeOrder: parsed.nodeOrder, removedNodeIds }, originWindow);
}

function handleNodeContentWithAnchorsCommand(args: Record<string, unknown>, originWindow: OriginWindow) {
  const shouldReturnDiagnostics = args.diagnostics === true;
  const totalStartedAt = readNowMs();
  const diagnostics: Record<string, number> = {};
  const parseParentStartedAt = readNowMs();
  const parent = parseNodeSnapshotArgs(readObjectArg(args.parent, 'parent'));
  diagnostics.parseParentMs = readElapsedMs(parseParentStartedAt);
  const parseAnchorsStartedAt = readNowMs();
  const affectedAnchors = parseNodeAnchorLocatorUpdateArray(args.affectedAnchors, 'affectedAnchors');
  diagnostics.parseAnchorsMs = readElapsedMs(parseAnchorsStartedAt);
  const upsertStartedAt = readNowMs();
  upsertNodeSnapshot(parent, { searchInvalidation: { workspaceInvalidation: 'defer' } });
  diagnostics.upsertNodeMs = readElapsedMs(upsertStartedAt);
  const updateAnchorsStartedAt = readNowMs();
  updateNodeAnchorLinks(affectedAnchors);
  diagnostics.updateAnchorsMs = readElapsedMs(updateAnchorsStartedAt);
  const enqueueSearchStartedAt = readNowMs();
  enqueueCoalescedWorkspaceSearchInvalidation([parent.nodeId]);
  diagnostics.enqueueSearchMs = readElapsedMs(enqueueSearchStartedAt);
  const scheduleMirrorStartedAt = readNowMs();
  scheduleMirrorSync([parent.nodeId, ...affectedAnchors.map((node) => node.nodeId)]);
  diagnostics.scheduleMirrorMs = readElapsedMs(scheduleMirrorStartedAt);
  const result = buildNodeContentWithAnchorsResult({ affectedAnchors, diagnostics, originWindow, parent, totalStartedAt });
  return shouldReturnDiagnostics ? result : omitNodeMutationDiagnostics(result);
}

function omitNodeMutationDiagnostics(result: object) {
  const rest = { ...result } as { diagnostics?: unknown };
  delete rest.diagnostics;
  return rest;
}

function handleUpdateNodeContentCommand(command: string, args: Record<string, unknown>, originWindow: OriginWindow) {
  const parsed = parseNodeSnapshotArgs(args);
  const collectionFolder = readCollectionVirtualFolderRow(parsed.nodeId);
  if (command === NATIVE_COMMANDS.updateNodeContent && collectionFolder && collectionFolder.title !== parsed.title) {
    const renamed = renameCollectionVirtualFolder({
      expectedUpdatedAt: collectionFolder.updated_at,
      id: parsed.nodeId,
      title: parsed.title,
      updatedAt: parsed.updatedAt
    });
    enqueueCoalescedWorkspaceSearchInvalidation(renamed.updatedNodeIds);
    return buildNodeMutationPatchResult({
      collectionRenames: renamed.collectionRenames,
      nodes: renamed.nodes,
      originWindow,
      updatedNodeIds: renamed.updatedNodeIds
    });
  }
  upsertNodeSnapshot(parsed, { searchInvalidation: { workspaceInvalidation: 'defer' } });
  enqueueCoalescedWorkspaceSearchInvalidation([parsed.nodeId]);
  scheduleMirrorSync([parsed.nodeId]);
  return buildNodeMutationPatchResult({ nodes: [parsed], originWindow, updatedNodeIds: [parsed.nodeId] });
}

export function handleNodeMutationCommand(command: string, args: Record<string, unknown>, originWindow: OriginWindow = null) {
  if (command === NATIVE_COMMANDS.createFolder) {
    return handleCreateNodeCommand(args, 'folder', originWindow);
  }
  if (command === NATIVE_COMMANDS.createTopic) {
    return handleCreateNodeCommand(args, 'topic', originWindow);
  }
  if (command === NATIVE_COMMANDS.createItem) {
    return handleCreateNodeCommand(args, 'item', originWindow);
  }
  if (command === NATIVE_COMMANDS.updateNodeContent || command === NATIVE_COMMANDS.updateNodeReveal) {
    return handleUpdateNodeContentCommand(command, args, originWindow);
  }
  if (command === NATIVE_COMMANDS.updateNodeContentWithAnchors) {
    return handleNodeContentWithAnchorsCommand(args, originWindow);
  }
  if (command === NATIVE_COMMANDS.flushDirtyNodeSyncVersions) {
    return flushAllDirtyNodeSyncVersions();
  }
  if (command === NATIVE_COMMANDS.replaceNodeOrder) {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return completeWorkspaceMutation(null, originWindow);
  }
  if (command === NATIVE_COMMANDS.moveNodes) {
    const result = moveNodes(parseMoveNodesArgs(args));
    scheduleMirrorSync(result.movedNodeIds);
    return completeWorkspaceMutation(result, originWindow);
  }
  if (command === NATIVE_COMMANDS.softDeleteNodes) {
    return handleSoftDeleteNodeCommand(args, originWindow);
  }
  if (command === NATIVE_COMMANDS.restoreNodes) {
    const parsed = parseRestoreNodesArgs(args);
    const result = restoreNodes(parsed);
    scheduleMirrorSync(result.restoredNodeIds);
    return completeWorkspaceMutation(result, originWindow);
  }
  if (command === NATIVE_COMMANDS.deleteNodesPermanently) {
    return handlePermanentDeleteNodeCommand(args, originWindow);
  }
  return undefined;
}
