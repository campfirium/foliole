import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import type {
  NativeCommandArgs,
  NativeCommandName,
  NativeApplyReviewGradeArgs,
  NativeRelearnNodeArgs,
  NativeNodeSnapshotArgs,
  NativeSaveReadingProgressArgs
} from '../../lib/platform/nativeContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { isDesktopRuntime } from '../shared/platform/runtime';
import { logRuntimeError } from '../shared/platform/runtimeLogging';

import { resolvePendingNodeSync, stagePendingNodeSync } from './workspacePendingNodeSync';

type FireAndForgetRuntimeCommand = Extract<
  NativeCommandName,
  | typeof NATIVE_COMMANDS.updateNodeContent
  | typeof NATIVE_COMMANDS.updateNodeReveal
  | typeof NATIVE_COMMANDS.relearnNode
  | typeof NATIVE_COMMANDS.replaceNodeOrder
  | typeof NATIVE_COMMANDS.softDeleteNodes
  | typeof NATIVE_COMMANDS.restoreNodes
  | typeof NATIVE_COMMANDS.deleteNodesPermanently
  | typeof NATIVE_COMMANDS.saveReadingProgress
>;

function toNodeSnapshotPayload(node: Node, position?: number): NativeNodeSnapshotArgs {
  return {
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    priority: node.priority ?? null,
    desiredRetention: node.desiredRetention ?? null,
    title: node.title,
    isTitleManual: Boolean(node.isTitleManual),
    hideTitleHeading: Boolean(node.hideTitleHeading),
    content: node.content,
    reveal: node.reveal,
    anchorLink: node.anchorLink ?? null,
    reading: node.reading ?? null,
    position: typeof position === 'number' ? position : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

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

function runFireAndForgetNodeSnapshotRuntimeSync(
  command: typeof NATIVE_COMMANDS.updateNodeContent | typeof NATIVE_COMMANDS.updateNodeReveal,
  payload: NativeNodeSnapshotArgs,
  action: string
) {
  stagePendingNodeSync(payload);
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(command, payload).then(
    () => {
      resolvePendingNodeSync(payload.nodeId, payload.updatedAt);
    },
    (error) => {
      logRuntimeError('runtime sync failed', {
        area: 'native',
        action,
        command,
        fallback: 'skip_sync',
        error
      });
    }
  );
}

export function syncNodeContentToRuntime(node: Node, position?: number) {
  runFireAndForgetNodeSnapshotRuntimeSync(
    NATIVE_COMMANDS.updateNodeContent,
    toNodeSnapshotPayload(node, position),
    'sync_node_content'
  );
}

export function syncNodeRevealToRuntime(node: Node, position?: number) {
  runFireAndForgetNodeSnapshotRuntimeSync(
    NATIVE_COMMANDS.updateNodeReveal,
    toNodeSnapshotPayload(node, position),
    'sync_node_reveal'
  );
}

export function syncNodeOrderToRuntime(nodeOrder: string[]) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.replaceNodeOrder, { nodeIds: nodeOrder }, 'sync_node_order');
}

export async function syncReviewGradeToRuntime(payload: NativeApplyReviewGradeArgs): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    if (!isDesktopRuntime()) {
      return;
    }
    const error = new Error('runtime bridge unavailable for review grade sync');
    logRuntimeError('runtime review grade sync failed', {
      area: 'native',
      action: 'sync_review_grade',
      command: NATIVE_COMMANDS.applyReviewGrade,
      fallback: 'throw',
      error
    });
    throw error;
  }
  try {
    await runtimeInvoke(NATIVE_COMMANDS.applyReviewGrade, payload);
  } catch (error) {
    logRuntimeError('runtime review grade sync failed', {
      area: 'native',
      action: 'sync_review_grade',
      command: NATIVE_COMMANDS.applyReviewGrade,
      fallback: 'throw',
      error
    });
    throw error;
  }
}

export function syncRelearnNodeToRuntime(payload: NativeRelearnNodeArgs) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.relearnNode, payload, 'sync_relearn_node');
}

export function syncSoftDeleteNodesToRuntime(payload: { nodeIds: string[]; deletedAt: string }) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.softDeleteNodes, payload, 'sync_soft_delete_nodes');
}

export function syncRestoreNodesToRuntime(payload: { nodeIds: string[] }) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.restoreNodes, payload, 'sync_restore_nodes');
}

export function syncDeleteNodesPermanentlyToRuntime(payload: { nodeIds: string[]; nodeOrder: string[] }) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.deleteNodesPermanently, payload, 'sync_delete_nodes_permanently');
}

export function syncReadingProgressToRuntime(payload: NativeSaveReadingProgressArgs) {
  runFireAndForgetRuntimeSync(NATIVE_COMMANDS.saveReadingProgress, payload, 'sync_reading_progress');
}
