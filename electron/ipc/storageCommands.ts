import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} from '../database/backupRestore.js';
import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { applyReviewGrade, resetNodeReviewState } from '../database/reviewMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
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
import {
  parseDeleteNodesPermanentlyArgs,
  parseRestoreNodesArgs,
  parseSoftDeleteNodesArgs
} from './nodeCommandArgs.js';
import { parseApplyReviewGradeArgs } from './reviewCommandArgs.js';
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

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

export async function handleStorageCommand(
  command: string,
  args: Record<string, unknown>
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
  if (command === NATIVE_COMMANDS.loadAppSettingsState) {
    return loadAppSettingsState();
  }
  if (command === NATIVE_COMMANDS.saveAppSettingsState) {
    await saveAppSettingsState(readSettingsObject(args.settings));
    return null;
  }
  if (command === NATIVE_COMMANDS.loadReviewSchedulerSettings) {
    return loadReviewSchedulerSettings();
  }
  if (command === NATIVE_COMMANDS.saveReviewSchedulerSettings) {
    return saveReviewSchedulerSettings(readSettingsObject(args.settings));
  }
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
