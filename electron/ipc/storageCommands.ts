import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} from '../database/backupRestore.js';
import {
  resetImportData
} from '../database/importMaintenance.js';
import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { applyReviewGrade, resetNodeReviewState } from '../database/reviewMutations.js';
import { loadWorkspaceListSnapshot } from '../database/workspaceListSnapshot.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { searchWorkspace } from '../database/workspaceSearch.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadImportManagerSettings, saveImportManagerSettings } from '../import/importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshManagedInboxMonitorFromSettings } from '../import/managedInboxMonitor.js';
import { loadNodeSourceUpdatePreview } from '../import/nodeSourceUpdatePreview.js';
import { rebuildMirrorAttachmentLinks } from '../mirror/rebuildAttachmentLinks.js';
import {
  loadReviewSchedulerSettings,
  saveReviewSchedulerSettings
} from '../reviewSchedulerSettings.js';

import {
  asNullableString,
  asString,
  asStringArray,
  asTimestamp,
  parseNodeSnapshotArgs,
  parseNodeViewStatePayloadArray
} from './commandParsers.js';
import { toNativeImportOverview } from './importOverviewPayload.js';
import { loadLibraryPathSettings, updateLibraryPathSetting } from './libraryPaths.js';
import {
  parseDeleteNodesPermanentlyArgs,
  parseRestoreNodesArgs,
  parseSoftDeleteNodesArgs
} from './nodeCommandArgs.js';
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';
import { parseApplyReviewGradeArgs } from './reviewCommandArgs.js';
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';
import { handleStorageAttachmentCommand } from './storageAttachmentCommands.js';

function readSettingsObject(settings: unknown) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('invalid argument: settings');
  }
  return settings as Record<string, unknown>;
}

function handleSqliteMaintenanceCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.listSqliteBackups) {
    return listApplicationDatabaseBackups();
  }
  if (command === NATIVE_COMMANDS.backupSqliteDatabase) {
    return createApplicationDatabaseBackup({
      destinationPath: asNullableString(args.destinationPath, 'destinationPath') ?? undefined
    });
  }
  if (command === NATIVE_COMMANDS.restoreSqliteDatabase) {
    return restoreApplicationDatabaseBackup({
      sourcePath: asString(args.sourcePath, 'sourcePath')
    });
  }
  return undefined;
}

function handleNodeMutationCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.updateNodeContent || command === NATIVE_COMMANDS.updateNodeReveal) {
    upsertNodeSnapshot(parseNodeSnapshotArgs(args));
    return null;
  }
  if (command === NATIVE_COMMANDS.replaceNodeOrder) {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return null;
  }
  if (command === NATIVE_COMMANDS.softDeleteNodes) {
    softDeleteNodes(parseSoftDeleteNodesArgs(args));
    return null;
  }
  if (command === NATIVE_COMMANDS.restoreNodes) {
    restoreNodes(parseRestoreNodesArgs(args));
    return null;
  }
  if (command === NATIVE_COMMANDS.deleteNodesPermanently) {
    deleteNodesPermanently(parseDeleteNodesPermanentlyArgs(args));
    return null;
  }
  return undefined;
}

async function handleSettingsStorageCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadImportManagerSettings) {
    return loadImportManagerSettings();
  }
  if (command === NATIVE_COMMANDS.loadAppSettingsState) {
    return loadAppSettingsState();
  }
  if (command === NATIVE_COMMANDS.saveAppSettingsState) {
    await saveAppSettingsState(readSettingsObject(args.settings));
    await refreshManagedInboxMonitorFromSettings();
    return null;
  }
  if (command === NATIVE_COMMANDS.loadLibraryPathSettings) {
    return loadLibraryPathSettings();
  }
  if (command === NATIVE_COMMANDS.rebuildMirrorAttachmentLinks) {
    return rebuildMirrorAttachmentLinks();
  }
  if (command === NATIVE_COMMANDS.updateLibraryPathSetting) {
    const result = await updateLibraryPathSetting({
      location: asString(args.location, 'location') as 'library_home' | 'inbox' | 'mirror',
      path: asNullableString(args.path, 'path')
    });
    await refreshManagedInboxMonitorFromSettings();
    return result;
  }
  if (command === NATIVE_COMMANDS.saveImportManagerSettings) {
    const result = saveImportManagerSettings(readSettingsObject(args.settings));
    await refreshKeepImportMonitorFromSettings();
    return result;
  }
  if (command === NATIVE_COMMANDS.loadReviewSchedulerSettings) {
    return loadReviewSchedulerSettings();
  }
  if (command === NATIVE_COMMANDS.saveReviewSchedulerSettings) {
    return saveReviewSchedulerSettings(readSettingsObject(args.settings));
  }
  return undefined;
}

function handleReadingAndReviewCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadReadingProgress) {
    return loadReadingProgress();
  }
  if (command === NATIVE_COMMANDS.saveReadingProgress) {
    saveReadingProgress({
      activeNodeId: asNullableString(args.activeNodeId, 'activeNodeId'),
      nodeViewStates: parseNodeViewStatePayloadArray(args.nodeViewStates, 'nodeViewStates'),
      updatedAt: asTimestamp(args.updatedAt, 'updatedAt')
    });
    return null;
  }
  if (command === NATIVE_COMMANDS.applyReviewGrade) {
    applyReviewGrade(parseApplyReviewGradeArgs(args));
    return null;
  }
  if (command === NATIVE_COMMANDS.relearnNode) {
    resetNodeReviewState(asString(args.nodeId, 'nodeId'));
    return null;
  }
  return undefined;
}

export async function handleStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2] = null
): Promise<unknown> {
  const nodeMutationResult = handleNodeMutationCommand(command, args);
  if (nodeMutationResult !== undefined) {
    return nodeMutationResult;
  }
  const sqliteMaintenanceResult = handleSqliteMaintenanceCommand(command, args);
  if (sqliteMaintenanceResult !== undefined) {
    return sqliteMaintenanceResult;
  }
  if (command === NATIVE_COMMANDS.loadWorkspaceSnapshot) {
    return loadWorkspaceSnapshot();
  }
  if (command === NATIVE_COMMANDS.loadWorkspaceListSnapshot) {
    return loadWorkspaceListSnapshot();
  }
  if (command === NATIVE_COMMANDS.loadNodeDocument) {
    return loadWorkspaceNodeDocument(asString(args.nodeId, 'nodeId'));
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
  if (command === NATIVE_COMMANDS.loadNodeSourceDetails) {
    return toNativeNodeSourceDetails(asString(args.node_id, 'node_id'));
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceUpdatePreview) {
    return loadNodeSourceUpdatePreview(asString(args.node_id, 'node_id'));
  }
  if (command === NATIVE_COMMANDS.resetImportData) {
    return resetImportData();
  }
  const settingsResult = await handleSettingsStorageCommand(command, args);
  if (settingsResult !== undefined) {
    return settingsResult;
  }
  const readingAndReviewResult = handleReadingAndReviewCommand(command, args);
  if (readingAndReviewResult !== undefined) {
    return readingAndReviewResult;
  }
  return undefined;
}
