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
  if (command === 'load_workspace_snapshot') {
    return loadWorkspaceSnapshot();
  }
  if (command === 'load_app_settings_state') {
    return loadAppSettingsState();
  }
  if (command === 'save_app_settings_state') {
    await saveAppSettingsState(readSettingsObject(args.settings));
    return null;
  }
  if (command === 'load_review_scheduler_settings') {
    return loadReviewSchedulerSettings();
  }
  if (command === 'save_review_scheduler_settings') {
    return saveReviewSchedulerSettings(readSettingsObject(args.settings));
  }
  if (command === 'load_reading_progress') {
    return loadReadingProgress();
  }
  if (command === 'save_reading_progress') {
    saveReadingProgress({
      activeNodeId: asNullableString(args.activeNodeId, 'activeNodeId'),
      nodeViewStates: parseNodeViewStatePayloadArray(args.nodeViewStates, 'nodeViewStates'),
      updatedAt: asTimestamp(args.updatedAt, 'updatedAt')
    });
    return null;
  }
  if (command === 'update_node_content' || command === 'update_node_reveal') {
    upsertNodeSnapshot(parseNodeSnapshotArgs(args));
    return null;
  }
  if (command === 'replace_node_order') {
    replaceNodeOrder(asStringArray(args.nodeIds, 'nodeIds'));
    return null;
  }
  if (command === 'soft_delete_nodes') {
    softDeleteNodes(parseSoftDeleteNodesArgs(args));
    return null;
  }
  if (command === 'restore_nodes') {
    restoreNodes(parseRestoreNodesArgs(args));
    return null;
  }
  if (command === 'delete_nodes_permanently') {
    deleteNodesPermanently(parseDeleteNodesPermanentlyArgs(args));
    return null;
  }
  if (command === 'apply_review_grade') {
    applyReviewGrade(parseApplyReviewGradeArgs(args));
    return null;
  }
  return undefined;
}
