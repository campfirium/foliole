import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeCommandArgs, NativeCommandName } from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './bridge';
import { logRuntimeError } from './runtimeLogging';
export {
  createWorkspaceRuntimeNodeSnapshot,
  replayPendingWorkspaceNodeSync,
  saveCreatedWorkspaceNodeSnapshot,
  saveWorkspaceNodeContentSnapshot,
  saveWorkspaceNodeContentSnapshotWithAnchors,
  saveWorkspaceNodeRevealSnapshot
} from './workspaceRuntimeNodeRepository';
import type {
  WorkspaceReadingProgressSavePayload,
  WorkspaceReadingProgressSnapshot,
  WorkspaceRelearnNodePayload,
  WorkspaceReviewGradeSyncPayload,
  WorkspaceRuntimeNodeDocument,
  WorkspaceRuntimeSnapshot
} from './workspaceRuntimeTypes';

type FireAndForgetRuntimeCommand = Extract<
  NativeCommandName,
  | typeof NATIVE_COMMANDS.relearnNode
  | typeof NATIVE_COMMANDS.replaceNodeOrder
  | typeof NATIVE_COMMANDS.softDeleteNodes
  | typeof NATIVE_COMMANDS.restoreNodes
  | typeof NATIVE_COMMANDS.deleteNodesPermanently
  | typeof NATIVE_COMMANDS.saveReadingProgress
>;

function runFireAndForgetRuntimeSync<T extends FireAndForgetRuntimeCommand>(
  command: T,
  payload: NativeCommandArgs<T>,
  action: string
) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(command, payload as Record<string, unknown>).catch((error) => {
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

export async function loadWorkspaceNodeDocumentFromRuntime(nodeId: string): Promise<WorkspaceRuntimeNodeDocument | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadNodeDocument, { nodeId });
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

export async function saveWorkspaceReviewGrade(payload: WorkspaceReviewGradeSyncPayload): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    throw new Error('runtime bridge unavailable for review grade sync');
  }
  await runtimeInvoke(NATIVE_COMMANDS.applyReviewGrade, payload);
}

export function saveWorkspaceRelearnNode(payload: WorkspaceRelearnNodePayload) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.relearnNode, payload, 'sync_relearn_node');
}

export function softDeleteWorkspaceNodes(payload: { nodeIds: string[]; deletedAt: string }) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.softDeleteNodes, payload, 'sync_soft_delete_nodes');
}

export function restoreWorkspaceNodes(payload: { nodeIds: string[] }) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.restoreNodes, payload, 'sync_restore_nodes');
}

export function deleteWorkspaceNodesPermanently(payload: { nodeIds: string[]; nodeOrder: string[] }) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.deleteNodesPermanently, payload, 'sync_delete_nodes_permanently');
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
