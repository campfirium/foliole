import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadNodeBacklinks } from '../database/nodeBacklinks.js';
import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { applyReviewGrade, resetNodeReviewState } from '../database/reviewMutations.js';
import { loadSyncNodeConflicts } from '../database/syncConflictReads.js';
import { loadSyncIndex } from '../database/syncIndex.js';
import { loadSyncNodes } from '../database/syncNodes.js';
import { loadSyncObjects } from '../database/syncObjects.js';
import { loadWorkspaceListSnapshot } from '../database/workspaceListSnapshot.js';
import { loadWorkspaceNodeDocument } from '../database/workspaceNodeDocument.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import {
  asNullableString,
  asStringArray,
  asString,
  asTimestamp,
  normalizeNodeViewStateWriteSource,
  parseNodeViewStatePayloadArray
} from './commandParsers.js';
import { parseApplyReviewGradeArgs } from './reviewCommandArgs.js';

export function handleWorkspaceReadCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.loadWorkspaceSnapshot) {
    return loadWorkspaceSnapshot();
  }
  if (command === NATIVE_COMMANDS.loadSyncIndex) {
    return loadSyncIndex();
  }
  if (command === NATIVE_COMMANDS.loadSyncNodes) {
    return loadSyncNodes(asStringArray(args.objectIds, 'objectIds'));
  }
  if (command === NATIVE_COMMANDS.loadSyncObjects) {
    return loadSyncObjects(
      asStringArray(args.objectIds, 'objectIds'),
      Array.isArray(args.objectTypes) ? asStringArray(args.objectTypes, 'objectTypes') : undefined
    );
  }
  if (command === NATIVE_COMMANDS.loadSyncNodeConflicts) {
    return loadSyncNodeConflicts(Array.isArray(args.objectIds) ? asStringArray(args.objectIds, 'objectIds') : undefined);
  }
  if (command === NATIVE_COMMANDS.loadWorkspaceListSnapshot) {
    return loadWorkspaceListSnapshot({
      includePdfOpenings: args.includePdfOpenings !== false
    });
  }
  if (command === NATIVE_COMMANDS.loadNodeDocument) {
    return loadWorkspaceNodeDocument(asString(args.nodeId, 'nodeId'));
  }
  if (command === NATIVE_COMMANDS.loadNodeBacklinks) {
    return loadNodeBacklinks(asString(args.node_id, 'node_id'));
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
      ...(args.browseRootNodeId === undefined
        ? {}
        : { browseRootNodeId: asString(args.browseRootNodeId, 'browseRootNodeId') }),
      nodeViewStates: parseNodeViewStatePayloadArray(args.nodeViewStates, 'nodeViewStates'),
      source: normalizeNodeViewStateWriteSource(args.source),
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
