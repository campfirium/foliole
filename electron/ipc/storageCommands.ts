import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} from '../database/backupRestore.js';
import { loadBackupSettings, saveBackupSettings } from '../database/backupSettings.js';
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
import { searchWorkspace } from '../database/workspaceSearch.js';
import { loadImportManagerSettings, saveImportManagerSettings } from '../import/importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshManagedInboxMonitorFromSettings } from '../import/managedInboxMonitor.js';
import { loadNodeSourceUpdatePreview } from '../import/nodeSourceUpdatePreview.js';
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
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';
import { handleStorageAttachmentCommand } from './storageAttachmentCommands.js';
import { handleReadingAndReviewCommand, handleWorkspaceReadCommand } from './storageReadCommands.js';

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
    deleteNodesPermanently(parsed);
    scheduleMirrorSync(parsed.nodeIds);
    return null;
  }
  return undefined;
}
async function handleSettingsStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2] = null
) {
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
  if (command === NATIVE_COMMANDS.loadBackupSettings) {
    return loadBackupSettings();
  }
  if (command === NATIVE_COMMANDS.rebuildMirrorOutput) {
    return rebuildMirrorOutput();
  }
  if (command === NATIVE_COMMANDS.rebuildMirrorAttachmentLinks) {
    return rebuildMirrorAttachmentLinks();
  }
  if (command === NATIVE_COMMANDS.exportCurrentArticleMirror) {
    return exportCurrentArticleMirror(asString(args.node_id, 'node_id'), window);
  }
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
  if (command === NATIVE_COMMANDS.saveBackupSettings) {
    return saveBackupSettings(readSettingsObject(args.settings));
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
export async function handleStorageCommand(
  command: string,
  args: Record<string, unknown>,
  window: Parameters<typeof handleStorageAttachmentCommand>[2] = null
): Promise<unknown> {
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
  if (command === NATIVE_COMMANDS.loadNodeSourceDetails) {
    return toNativeNodeSourceDetails(asString(args.node_id, 'node_id'));
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceUpdatePreview) {
    return loadNodeSourceUpdatePreview(asString(args.node_id, 'node_id'));
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
