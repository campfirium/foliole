import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import type {
  NativeApplyReviewGradeArgs,
  NativeNodeSnapshotArgs,
  NativeSaveReadingProgressArgs
} from '../../lib/platform/nativeContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { isDesktopRuntime } from '../shared/platform/runtime';

function toNodeSnapshotPayload(node: Node, position?: number): NativeNodeSnapshotArgs {
  return {
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    title: node.title,
    isTitleManual: Boolean(node.isTitleManual),
    content: node.content,
    reveal: node.reveal,
    anchorLink: node.anchorLink ?? null,
    position: typeof position === 'number' ? position : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

export function syncNodeContentToRuntime(node: Node, position?: number) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.updateNodeContent, toNodeSnapshotPayload(node, position)).catch(() => undefined);
}

export function syncNodeRevealToRuntime(node: Node, position?: number) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.updateNodeReveal, toNodeSnapshotPayload(node, position)).catch(() => undefined);
}

export function syncNodeOrderToRuntime(nodeOrder: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.replaceNodeOrder, { nodeIds: nodeOrder }).catch(() => undefined);
}

export async function syncReviewGradeToRuntime(payload: NativeApplyReviewGradeArgs): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    if (!isDesktopRuntime()) {
      return;
    }
    throw new Error('runtime bridge unavailable for review grade sync');
  }
  await runtimeInvoke(NATIVE_COMMANDS.applyReviewGrade, payload);
}

export function syncSoftDeleteNodesToRuntime(payload: { nodeIds: string[]; deletedAt: string }) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.softDeleteNodes, payload).catch(() => undefined);
}

export function syncRestoreNodesToRuntime(payload: { nodeIds: string[] }) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.restoreNodes, payload).catch(() => undefined);
}

export function syncDeleteNodesPermanentlyToRuntime(payload: { nodeIds: string[]; nodeOrder: string[] }) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.deleteNodesPermanently, payload).catch(() => undefined);
}

export function syncReadingProgressToRuntime(payload: NativeSaveReadingProgressArgs) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.saveReadingProgress, payload).catch(() => undefined);
}
