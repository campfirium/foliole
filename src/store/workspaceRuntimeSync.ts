import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { isDesktopRuntime } from '../shared/platform/runtime';

interface ReviewCardSnapshot {
  due: string;
  last_review: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}

interface ReviewGradeRuntimePayload {
  nodeId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: string;
  cardBefore: ReviewCardSnapshot;
  cardAfter: ReviewCardSnapshot;
}

interface SoftDeleteNodesRuntimePayload {
  nodeIds: string[];
  deletedAt: string;
}

interface RestoreNodesRuntimePayload {
  nodeIds: string[];
}

interface DeleteNodesPermanentlyRuntimePayload {
  nodeIds: string[];
  nodeOrder: string[];
}

interface ReadingProgressNodeViewState {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number;
  selectionTo: number;
}

interface ReadingProgressRuntimePayload {
  activeNodeId: string | null;
  nodeViewStates: ReadingProgressNodeViewState[];
  updatedAt: string;
}

function toNodeSnapshotPayload(node: Node, position?: number) {
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
  void runtimeInvoke('update_node_content', toNodeSnapshotPayload(node, position)).catch(() => undefined);
}

export function syncNodeRevealToRuntime(node: Node, position?: number) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('update_node_reveal', toNodeSnapshotPayload(node, position)).catch(() => undefined);
}

export function syncNodeOrderToRuntime(nodeOrder: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('replace_node_order', { nodeIds: nodeOrder }).catch(() => undefined);
}

export async function syncReviewGradeToRuntime(payload: ReviewGradeRuntimePayload): Promise<void> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    if (!isDesktopRuntime()) {
      return;
    }
    throw new Error('runtime bridge unavailable for review grade sync');
  }
  await runtimeInvoke('apply_review_grade', payload as unknown as Record<string, unknown>);
}

export function syncSoftDeleteNodesToRuntime(payload: SoftDeleteNodesRuntimePayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('soft_delete_nodes', payload as unknown as Record<string, unknown>).catch(() => undefined);
}

export function syncRestoreNodesToRuntime(payload: RestoreNodesRuntimePayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('restore_nodes', payload as unknown as Record<string, unknown>).catch(() => undefined);
}

export function syncDeleteNodesPermanentlyToRuntime(payload: DeleteNodesPermanentlyRuntimePayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('delete_nodes_permanently', payload as unknown as Record<string, unknown>).catch(() => undefined);
}

export function syncReadingProgressToRuntime(payload: ReadingProgressRuntimePayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke('save_reading_progress', payload as unknown as Record<string, unknown>).catch(() => undefined);
}
