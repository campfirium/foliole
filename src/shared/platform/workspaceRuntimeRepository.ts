import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { refreshRuntimeRemovedSources } from './removedSourcesRuntimeRepository';
import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
import {
  capturePendingNodeOrderAck,
  drainPendingWorkspaceRelearnNode,
  resolveCapturedPendingNodeOrder
} from './workspaceRuntimeDurableRepository';
import {
  isDeleteNodesPermanentlyResult,
  isMoveNodesResult,
  isRestoreNodesResult,
  isSoftDeleteNodesResult,
  logWorkspaceRuntimeMutationError
} from './workspaceRuntimeMutationResults';
export { loadWorkspaceNodeDocumentFromRuntime } from './workspaceRuntimeDocumentRepository';
export { replayPendingWorkspaceNodeSync } from './workspacePendingNodeReplay';
export {
  replayPendingWorkspaceDurableMutations,
  saveWorkspaceNodeOrder,
  saveWorkspaceReadingProgress,
  saveWorkspaceReadingProgressNow,
  saveWorkspaceRelearnNode
} from './workspaceRuntimeDurableRepository';
export {
  createWorkspaceRuntimeNodeSnapshot,
  saveCreatedWorkspaceNodeSnapshot,
  saveWorkspaceNodeContentSnapshot,
  saveWorkspaceNodeContentSnapshotWithAnchors,
  saveWorkspaceNodeRevealSnapshot
} from './workspaceRuntimeNodeRepository';
export {
  saveCreatedWorkspaceNodeMutationSnapshot,
  saveWorkspaceNodeContentMutationWithAnchors
} from './workspaceRuntimeNodeMutationsNow';
export type { RuntimeNodeContentMutationDiagnostics } from './workspaceRuntimeNodeMutationsNow';
export { saveWorkspaceNodeContentSnapshotNow } from './workspaceRuntimeNodeSnapshotNow';
export { saveWorkspaceNodeMutationSnapshotNow } from './workspaceRuntimeNodeSnapshotNow';
import type {
  WorkspaceReadingProgressSnapshot,
  WorkspaceDeleteNodesPermanentlyResult,
  WorkspaceMoveNodesPayload,
  WorkspaceMoveNodesResult,
  WorkspaceRestoreNodesResult,
  WorkspaceReviewGradeSyncPayload,
  WorkspaceSoftDeleteNodesResult,
  WorkspaceRuntimeSnapshot
} from './workspaceRuntimeTypes';

export function hasWorkspaceRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function loadWorkspaceListSnapshotFromRuntime(args?: {
  includePdfOpenings?: boolean;
}): Promise<WorkspaceRuntimeSnapshot | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadWorkspaceListSnapshot, args);
}

export async function loadReadingProgressFromRuntime(): Promise<WorkspaceReadingProgressSnapshot | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadReadingProgress);
}

export async function moveWorkspaceNodes(payload: WorkspaceMoveNodesPayload): Promise<WorkspaceMoveNodesResult | undefined> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return undefined;
  }
  const pendingOrderAck = capturePendingNodeOrderAck();
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.moveNodes, payload);
    if (!isMoveNodesResult(result)) return undefined;
    resolveCapturedPendingNodeOrder(pendingOrderAck);
    return result;
  } catch (error) {
    logWorkspaceRuntimeMutationError('sync_move_nodes', NATIVE_COMMANDS.moveNodes, error);
    return undefined;
  }
}

export async function saveWorkspaceReviewGrade(payload: WorkspaceReviewGradeSyncPayload): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    if (!isDesktopRuntime()) {
      return;
    }
    const error = new Error('runtime bridge unavailable for review grade sync');
    logReviewGradeRuntimeError(error);
    throw error;
  }
  try {
    await drainPendingWorkspaceRelearnNode(payload.nodeId);
    await runtimeInvoke(NATIVE_COMMANDS.applyReviewGrade, payload);
  } catch (error) {
    logReviewGradeRuntimeError(error);
    throw error;
  }
}

function logReviewGradeRuntimeError(error: unknown) {
  logRuntimeError('runtime review grade sync failed', {
    area: 'native',
    action: 'sync_review_grade',
    fallback: 'throw',
    error
  });
}

export async function restoreWorkspaceNodes(payload: { nodeIds: string[] }): Promise<WorkspaceRestoreNodesResult | undefined> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return undefined;
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.restoreNodes, payload);
    return isRestoreNodesResult(result) ? result : undefined;
  } catch (error) {
    logWorkspaceRuntimeMutationError('sync_restore_nodes', NATIVE_COMMANDS.restoreNodes, error);
    return undefined;
  }
}

export async function softDeleteWorkspaceNodes(
  payload: { nodeIds: string[]; deletedAt: string }
): Promise<WorkspaceSoftDeleteNodesResult | undefined> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return undefined;
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.softDeleteNodes, payload);
    return isSoftDeleteNodesResult(result) ? result : undefined;
  } catch (error) {
    logWorkspaceRuntimeMutationError('sync_soft_delete_nodes', NATIVE_COMMANDS.softDeleteNodes, error);
    return undefined;
  }
}

export async function deleteWorkspaceNodesPermanently(
  payload: { nodeIds: string[]; nodeOrder: string[] }
): Promise<WorkspaceDeleteNodesPermanentlyResult | undefined> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return undefined;
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.deleteNodesPermanently, payload);
    if (isDeleteNodesPermanentlyResult(result)) {
      await refreshRuntimeRemovedSources().catch((error) => {
        logRuntimeError('runtime post-sync refresh failed', {
          area: 'native',
          action: 'sync_delete_nodes_permanently_post_refresh',
          command: NATIVE_COMMANDS.deleteNodesPermanently,
          fallback: 'keep_cached',
          error
        });
      });
      return result;
    }
    return undefined;
  } catch (error) {
    logWorkspaceRuntimeMutationError('sync_delete_nodes_permanently', NATIVE_COMMANDS.deleteNodesPermanently, error);
    return undefined;
  }
}

export async function flushDirtyWorkspaceNodeSyncVersions(): Promise<string[]> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return [];
  }
  return runtimeInvoke(NATIVE_COMMANDS.flushDirtyNodeSyncVersions);
}
