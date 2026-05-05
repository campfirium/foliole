import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { applyReviewGrade, resetNodeReviewState } from '../database/reviewMutations.js';
import { loadWorkspaceListSnapshot } from '../database/workspaceListSnapshot.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import {
  asNullableString,
  asString,
  asTimestamp,
  parseNodeViewStatePayloadArray
} from './commandParsers.js';
import { parseApplyReviewGradeArgs } from './reviewCommandArgs.js';

export function handleWorkspaceReadCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadWorkspaceSnapshot) {
    return loadWorkspaceSnapshot();
  }
  if (command === NATIVE_COMMANDS.loadWorkspaceListSnapshot) {
    return loadWorkspaceListSnapshot();
  }
  if (command === NATIVE_COMMANDS.loadNodeDocument) {
    return loadWorkspaceNodeDocument(asString(args.nodeId, 'nodeId'));
  }
  return undefined;
}

export function handleReadingAndReviewCommand(command: string, args: Record<string, unknown>) {
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
