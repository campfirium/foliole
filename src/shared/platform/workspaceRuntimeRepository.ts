import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeCommandArgs, NativeCommandName } from '../../../lib/platform/nativeContract';

import { refreshRuntimeRemovedSources } from './removedSourcesRuntimeRepository';
import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeError } from './runtimeLogging';
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
  WorkspaceReadingProgressSavePayload,
  WorkspaceReadingProgressSnapshot,
  WorkspaceRelearnNodePayload,
  WorkspaceDeleteNodesPermanentlyResult,
  WorkspaceMoveNodesPayload,
  WorkspaceMoveNodesResult,
  WorkspaceRestoreNodesResult,
  WorkspaceReviewGradeSyncPayload,
  WorkspaceSoftDeleteNodesResult,
  WorkspaceRuntimeSnapshot
} from './workspaceRuntimeTypes';

type FireAndForgetRuntimeCommand = Extract<
  NativeCommandName,
  | typeof NATIVE_COMMANDS.relearnNode
  | typeof NATIVE_COMMANDS.replaceNodeOrder
  | typeof NATIVE_COMMANDS.saveReadingProgress
>;

function runFireAndForgetRuntimeSync<T extends FireAndForgetRuntimeCommand>(
  command: T,
  payload: NativeCommandArgs<T>,
  action: string,
  onSynced?: () => Promise<unknown> | unknown
) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(command, payload as Record<string, unknown>)
    .then(() => {
      if (!onSynced) {
        return undefined;
      }
      return Promise.resolve(onSynced()).catch((error) => {
        logRuntimeError('runtime post-sync refresh failed', {
          area: 'native',
          action: `${action}_post_refresh`,
          command,
          fallback: 'keep_cached',
          error
        });
      });
    })
    .catch((error) => {
      logRuntimeError('runtime sync failed', {
        area: 'native',
        action,
        command,
        fallback: 'skip_sync',
        error
      });
    });
}

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

export function saveWorkspaceNodeOrder(nodeOrder: string[]) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.replaceNodeOrder, { nodeIds: nodeOrder }, 'sync_node_order');
}

export async function moveWorkspaceNodes(payload: WorkspaceMoveNodesPayload): Promise<WorkspaceMoveNodesResult | undefined> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return undefined;
  }
  try {
    const result = await runtimeInvoke(NATIVE_COMMANDS.moveNodes, payload);
    return isMoveNodesResult(result) ? result : undefined;
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

export function saveWorkspaceRelearnNode(payload: WorkspaceRelearnNodePayload) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.relearnNode, payload, 'sync_relearn_node');
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

export function saveWorkspaceReadingProgress(payload: WorkspaceReadingProgressSavePayload) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.saveReadingProgress, payload, 'sync_reading_progress');
}

export async function saveWorkspaceReadingProgressNow(payload: WorkspaceReadingProgressSavePayload): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  await runtimeInvoke(NATIVE_COMMANDS.saveReadingProgress, payload);
}

export async function flushDirtyWorkspaceNodeSyncVersions(): Promise<string[]> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return [];
  }
  return runtimeInvoke(NATIVE_COMMANDS.flushDirtyNodeSyncVersions);
}
