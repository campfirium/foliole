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
  loadImportOverview
} from '../database/importOverview.js';
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
import { loadImportManagerSettings, saveImportManagerSettings } from '../import/importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshManagedInboxMonitorFromSettings } from '../import/managedInboxMonitor.js';
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
import { toNativeNodeSourceDetails } from './nodeSourceDetailsPayload.js';
import { parseApplyReviewGradeArgs } from './reviewCommandArgs.js';
import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

function toNativeImportResult(record: Awaited<ReturnType<typeof loadImportOverview>>['latestResult']) {
  if (!record) {
    return null;
  }
  return {
    content_fingerprint: record.contentFingerprint,
    degraded_reason: record.degradedReason,
    duplicate_semantic: record.duplicateSemantic,
    failure_reason: record.failureReason,
    import_id: record.importId,
    imported_at: record.importedAt,
    node_id: record.nodeId,
    provider: record.provider,
    result_status: record.resultStatus,
    source_fingerprint: record.sourceFingerprint,
    source_kind: record.sourceKind,
    source_locator: record.sourceLocator,
    source_name: record.sourceName
  };
}

function toNativeImportOverview() {
  const overview = loadImportOverview();
  return {
    latest_failure: toNativeImportResult(overview.latestFailure),
    latest_result: toNativeImportResult(overview.latestResult),
    recent_runs: overview.recentRuns.map((record) => toNativeImportResult(record))
  };
}

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
  if (command === NATIVE_COMMANDS.loadImportOverview) {
    return toNativeImportOverview();
  }
  if (command === NATIVE_COMMANDS.loadNodeSourceDetails) {
    return toNativeNodeSourceDetails(asString(args.node_id, 'node_id'));
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
