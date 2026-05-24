import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resetImportData } from '../database/importMaintenance.js';
import {
  deleteNodesPermanently,
  flushAllDirtyNodeSyncVersions,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  updateNodeAnchorLinks,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';
import { searchWorkspace } from '../database/workspaceSearch.js';
import { reimportCurrentTopicSource } from '../import/currentSourceReimport.js';
import { loadNodeSourceUpdatePreview } from '../import/nodeSourceUpdatePreview.js';
import { mergeReadwiseTopicHighlights } from '../import/readwiseTopicMerge.js';
import { restoreRemovedSource } from '../import/removedSourceRestore.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';

import {
  parseNodeAnchorLocatorUpdateArray,
  asString,
  asStringArray,
  parseNodeCreationArgs,
  parseNodeSnapshotArgs
} from './commandParsers.js';
import { toNativeImportOverview } from './importOverviewPayload.js';
import {
  parseDeleteNodesPermanentlyArgs,
  parseRestoreNodesArgs,
  parseSoftDeleteNodesArgs
} from './nodeCommandArgs.js';
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';
import { toNativePdfImportsInventory } from './pdfImportsInventoryPayload.js';
import { toNativeReadwiseBooksInventory } from './readwiseBooksInventoryPayload.js';
import { loadRemovedSources } from './removedSourcesPayload.js';
import { handleStorageAttachmentCommand } from './storageAttachmentCommands.js';
import {
  handleSqliteMaintenanceCommand,
  readObjectArg
} from './storageCommandSupport.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';
import { handleSettingsStorageCommand } from './storageSettingsCommands.js';
import { handleSyncMutationCommand } from './storageSyncCommands.js';
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

function handleNodeMutationCommand(command: string, args: Record<string, unknown>) {
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

export async function handleStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2] = null
): Promise<unknown> {
  const syncMutationResult = handleSyncMutationCommand(command, args);
  if (syncMutationResult !== undefined) {
    return syncMutationResult;
  }
  const nodeMutationResult = await handleNodeMutationCommand(command, args);
  if (nodeMutationResult !== undefined) {
    return nodeMutationResult;
  }
  const sqliteMaintenanceResult = handleSqliteMaintenanceCommand(command, args);
  if (sqliteMaintenanceResult !== undefined) {
    return sqliteMaintenanceResult;
  }
  const workspaceReadResult = handleWorkspaceReadCommand(command, args);
  if (workspaceReadResult !== undefined) {
    return workspaceReadResult;
  }
  const attachmentResult = handleStorageAttachmentCommand(command, args, window);
  if (attachmentResult !== undefined) {
    return attachmentResult;
  }
  const storageReadResult = await handleStorageReadCommand(command, args);
  if (storageReadResult !== undefined) {
    return storageReadResult;
  }
  const importMutationResult = await handleImportMutationCommand(command, args, window);
  if (importMutationResult !== undefined) {
    return importMutationResult;
  }
  const settingsResult = await handleSettingsStorageCommand(command, args, window);
  if (settingsResult !== undefined) {
    return settingsResult;
  }
  const readingAndReviewResult = handleReadingAndReviewCommand(command, args);
  if (readingAndReviewResult !== undefined) {
    return readingAndReviewResult;
  }
  return undefined;
}

async function handleStorageReadCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.searchWorkspace) {
    return searchWorkspace(asString(args.query, 'query'));
  }
  if (command === NATIVE_COMMANDS.loadImportOverview) {
    return toNativeImportOverview();
  }
  if (command === NATIVE_COMMANDS.loadRemovedSources) {
    return loadRemovedSources();
  }
  if (command === NATIVE_COMMANDS.loadPdfImportsInventory) {
    return toNativePdfImportsInventory();
  }
  if (command === NATIVE_COMMANDS.loadReadwiseBooksInventory) {
    return toNativeReadwiseBooksInventory();
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceDetails) {
    return toNativeNodeSourceDetails(asString(args.node_id, 'node_id'));
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceUpdatePreview) {
    return loadNodeSourceUpdatePreview(asString(args.node_id, 'node_id'));
  }
  return undefined;
}

async function handleImportMutationCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2]
) {
  if (command === NATIVE_COMMANDS.mergeReadwiseTopicHighlights) {
    const result = await mergeReadwiseTopicHighlights(asString(args.node_id, 'node_id'), window);
    if (result.status === 'merged') {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (command === NATIVE_COMMANDS.resetImportData) {
    const result = resetImportData();
    if (result.deletedNodeCount > 0) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (command === NATIVE_COMMANDS.restoreRemovedSource) {
    const result = await restoreRemovedSource(asString(args.rule_id, 'rule_id'), asString(args.source_path, 'source_path'));
    if (result.status === 'restored' && result.node_id) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  if (command === NATIVE_COMMANDS.devReimportCurrentTopicSource) {
    const result = await reimportCurrentTopicSource(asString(args.node_id, 'node_id'));
    if (result.status === 'reimported' && result.node_id) {
      notifyWorkspaceContentChanged();
    }
    return result;
  }
  return undefined;
}
