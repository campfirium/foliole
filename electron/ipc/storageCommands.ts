import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { applyReviewGrade } from '../database/reviewMutations.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import {
  loadReviewSchedulerSettings,
  saveReviewSchedulerSettings
} from '../reviewSchedulerSettings.js';

import {
  asNullableString,
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

export async function handleStorageCommand(
  command: string,
  args: Record<string, unknown>
): Promise<unknown> {
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
  if (command === NATIVE_COMMANDS.applyReviewGrade) {
    applyReviewGrade(parseApplyReviewGradeArgs(args));
    return null;
  }
  return undefined;
}
