import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/bridge';

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

const REVIEW_SYNC_RETRY_DELAY_MS = 1500;
const reviewGradeSyncQueue: ReviewGradeRuntimePayload[] = [];
let reviewGradeFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isReviewGradeFlushing = false;

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

export async function syncReviewGradeToRuntime(payload: ReviewGradeRuntimePayload): Promise<boolean> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return true;
  }
  try {
    await runtimeInvoke('apply_review_grade', payload as unknown as Record<string, unknown>);
    return true;
  } catch {
    return false;
  }
}

function scheduleReviewGradeFlush(delayMs: number) {
  if (reviewGradeFlushTimer !== null) {
    return;
  }
  reviewGradeFlushTimer = setTimeout(() => {
    reviewGradeFlushTimer = null;
    void flushReviewGradeQueue();
  }, delayMs);
}

async function flushReviewGradeQueue(): Promise<void> {
  if (isReviewGradeFlushing) {
    return;
  }
  isReviewGradeFlushing = true;
  try {
    while (reviewGradeSyncQueue.length > 0) {
      const payload = reviewGradeSyncQueue[0];
      const synced = await syncReviewGradeToRuntime(payload);
      if (!synced) {
        scheduleReviewGradeFlush(REVIEW_SYNC_RETRY_DELAY_MS);
        return;
      }
      reviewGradeSyncQueue.shift();
    }
  } finally {
    isReviewGradeFlushing = false;
  }
}

export function syncReviewGradeToRuntimeWithRetry(payload: ReviewGradeRuntimePayload): void {
  reviewGradeSyncQueue.push(payload);
  scheduleReviewGradeFlush(0);
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
