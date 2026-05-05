import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadBackupSettings, saveBackupSettings } from '../database/backupSettings.js';
import {
  loadExternalSearchBrowseEntries,
  loadExternalSearchPreview,
  pruneExternalSearchCache,
  rebuildExternalSearchIndexes
} from '../database/externalSearchCache.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from '../database/externalSearchFolders.js';
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
import { loadSyncPeers, saveSyncPeers } from '../database/syncPeers.js';
import { searchWorkspace } from '../database/workspaceSearch.js';
import { notifyExternalSearchFoldersChanged } from '../externalSearchBackgroundRefreshRuntime.js';
import { loadImportManagerSettings, saveImportManagerSettings } from '../import/importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshManagedInboxMonitorFromSettings } from '../import/managedInboxMonitor.js';
import { loadNodeSourceUpdatePreview } from '../import/nodeSourceUpdatePreview.js';
import { mergeReadwiseTopicHighlights } from '../import/readwiseTopicMerge.js';
import { exportCurrentArticleMirror } from '../mirror/exportCurrentArticleMirror.js';
import { scheduleMirrorSync } from '../mirror/mirrorSyncScheduler.js';
import { rebuildMirrorAttachmentLinks } from '../mirror/rebuildAttachmentLinks.js';
import { rebuildMirrorOutput } from '../mirror/rebuildMirrorOutput.js';
import {
  loadReviewSchedulerSettings,
  saveReviewSchedulerSettings
} from '../reviewSchedulerSettings.js';

import {
  asNullableString,
  parseNodeAnchorLocatorUpdateArray,
  asString,
  asStringArray,
  parseNodeCreationArgs,
  parseNodeSnapshotArgs
} from './commandParsers.js';
import { toNativeImportOverview } from './importOverviewPayload.js';
import { loadLibraryPathSettings, updateLibraryPathSetting } from './libraryPaths.js';
import {
  parseDeleteNodesPermanentlyArgs,
  parseRestoreNodesArgs,
  parseSoftDeleteNodesArgs
} from './nodeCommandArgs.js';
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';
import { toNativePdfImportsInventory } from './pdfImportsInventoryPayload.js';
import { toNativeReadwiseBooksInventory } from './readwiseBooksInventoryPayload.js';
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';
import { handleStorageAttachmentCommand } from './storageAttachmentCommands.js';
import {
  handleSqliteMaintenanceCommand,
  readObjectArg,
  readSettingsObject
} from './storageCommandSupport.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';
import { handleSyncMutationCommand } from './storageSyncCommands.js';

function handleNodeMutationCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.createFolder) {
    const parsed = parseNodeCreationArgs(args, 'folder');
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return null;
  }
  if (command === NATIVE_COMMANDS.createTopic) {
    const parsed = parseNodeCreationArgs(args, 'topic');
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return null;
  }
  if (command === NATIVE_COMMANDS.createItem) {
    const parsed = parseNodeCreationArgs(args, 'item');
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return null;
  }
  if (command === NATIVE_COMMANDS.updateNodeContent || command === NATIVE_COMMANDS.updateNodeReveal) {
    const parsed = parseNodeSnapshotArgs(args);
    upsertNodeSnapshot(parsed);
    scheduleMirrorSync([parsed.nodeId]);
    return null;
  }
  if (command === NATIVE_COMMANDS.updateNodeContentWithAnchors) {
    const parent = parseNodeSnapshotArgs(readObjectArg(args.parent, 'parent'));
    const affectedAnchors = parseNodeAnchorLocatorUpdateArray(args.affectedAnchors, 'affectedAnchors');
    upsertNodeSnapshot(parent);
    updateNodeAnchorLinks(affectedAnchors);
    scheduleMirrorSync([parent.nodeId, ...affectedAnchors.map((node) => node.nodeId)]);
    return null;
  }
  if (command === NATIVE_COMMANDS.flushDirtyNodeSyncVersions) {
    return flushAllDirtyNodeSyncVersions();
  }
  if (command === NATIVE_COMMANDS.replaceNodeOrder) {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return null;
  }
  if (command === NATIVE_COMMANDS.softDeleteNodes) {
    const parsed = parseSoftDeleteNodesArgs(args);
    softDeleteNodes(parsed);
    scheduleMirrorSync(parsed.nodeIds);
    return null;
  }
  if (command === NATIVE_COMMANDS.restoreNodes) {
    const parsed = parseRestoreNodesArgs(args);
    restoreNodes(parsed);
    scheduleMirrorSync(parsed.nodeIds);
    return null;
  }
  if (command === NATIVE_COMMANDS.deleteNodesPermanently) {
    const parsed = parseDeleteNodesPermanentlyArgs(args);
    const affectedParentNodeIds = deleteNodesPermanently(parsed);
    scheduleMirrorSync([...new Set([...parsed.nodeIds, ...affectedParentNodeIds])]);
    return null;
  }
  return undefined;
}
async function handleSettingsStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2] = null
) {
  const externalSearchResult = handleExternalSearchStorageCommand(command, args);
  if (externalSearchResult !== undefined) return externalSearchResult;
  if (command === NATIVE_COMMANDS.loadImportManagerSettings) return loadImportManagerSettings();
  if (command === NATIVE_COMMANDS.loadAppSettingsState) return loadAppSettingsState();
  if (command === NATIVE_COMMANDS.saveAppSettingsState) {
    await saveAppSettingsState(readSettingsObject(args.settings));
    await refreshManagedInboxMonitorFromSettings();
    return null;
  }
  if (command === NATIVE_COMMANDS.loadSyncPeers) return loadSyncPeers();
  if (command === NATIVE_COMMANDS.saveSyncPeers) {
    return saveSyncPeers(Array.isArray(args.peers) ? (args.peers as Parameters<typeof saveSyncPeers>[0]) : []);
  }
  if (command === NATIVE_COMMANDS.loadLibraryPathSettings) return loadLibraryPathSettings();
  if (command === NATIVE_COMMANDS.loadBackupSettings) return loadBackupSettings();
  if (command === NATIVE_COMMANDS.rebuildMirrorOutput) return rebuildMirrorOutput();
  if (command === NATIVE_COMMANDS.rebuildMirrorAttachmentLinks) return rebuildMirrorAttachmentLinks();
  if (command === NATIVE_COMMANDS.exportCurrentArticleMirror) return exportCurrentArticleMirror(asString(args.node_id, 'node_id'), window);
  if (command === NATIVE_COMMANDS.updateLibraryPathSetting) {
    const location = asString(args.location, 'location') as 'library_home' | 'assets_dir' | 'inbox' | 'mirror';
    const result = await updateLibraryPathSetting({
      location,
      path: asNullableString(args.path, 'path')
    });
    if (location === 'assets_dir' || location === 'library_home') {
      await rebuildMirrorAttachmentLinks();
    }
    await refreshManagedInboxMonitorFromSettings();
    return result;
  }
  if (command === NATIVE_COMMANDS.saveBackupSettings) return saveBackupSettings(readSettingsObject(args.settings));
  if (command === NATIVE_COMMANDS.saveImportManagerSettings) {
    const result = saveImportManagerSettings(readSettingsObject(args.settings));
    await refreshKeepImportMonitorFromSettings();
    return result;
  }
  if (command === NATIVE_COMMANDS.loadReviewSchedulerSettings) return loadReviewSchedulerSettings();
  if (command === NATIVE_COMMANDS.saveReviewSchedulerSettings) return saveReviewSchedulerSettings(readSettingsObject(args.settings));
  return undefined;
}

function handleExternalSearchStorageCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadExternalSearchFolders) return loadExternalSearchFolders();
  if (command === NATIVE_COMMANDS.saveExternalSearchFolders) {
    const folders = Array.isArray(args.folders) ? args.folders : [];
    const savedFolders = saveExternalSearchFolders(folders as Parameters<typeof saveExternalSearchFolders>[0]);
    pruneExternalSearchCache(savedFolders.map((folder) => folder.id));
    notifyExternalSearchFoldersChanged();
    return savedFolders;
  }
  if (command === NATIVE_COMMANDS.rebuildExternalSearchIndex) {
    return rebuildExternalSearchIndexes(asNullableString(args.folder_id, 'folder_id') ?? undefined);
  }
  if (command === NATIVE_COMMANDS.loadExternalSearchBrowseEntries) {
    return loadExternalSearchBrowseEntries(asString(args.folder_id, 'folder_id'));
  }
  if (command === NATIVE_COMMANDS.loadExternalSearchPreview) {
    return loadExternalSearchPreview(asString(args.absolute_path, 'absolute_path'));
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
  if (command === NATIVE_COMMANDS.searchWorkspace) {
    return searchWorkspace(asString(args.query, 'query'));
  }
  if (command === NATIVE_COMMANDS.loadImportOverview) {
    return toNativeImportOverview();
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
  if (command === NATIVE_COMMANDS.mergeReadwiseTopicHighlights) {
    return mergeReadwiseTopicHighlights(asString(args.node_id, 'node_id'), window);
  }
  if (command === NATIVE_COMMANDS.resetImportData) {
    return resetImportData();
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
