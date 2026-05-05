import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getReviewItemKind, isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade } from '../features/review/model/reviewTypes';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';

import {
  completeCompanionReadingReview as completeCompanionReadingReviewBase,
  deferCompanionReadingReview as deferCompanionReadingReviewBase,
  dismissCompanionReadingReview as dismissCompanionReadingReviewBase
} from './companionReadingReview';

export interface CompanionReviewCard {
  content: string;
  due: string;
  itemKind: 'fsrs' | 'reading';
  nodeId: string;
  queuePosition: number;
  remainingCount: number;
  reveal: string | null;
  title: string;
  totalCount: number;
}

export interface CompanionReviewSession {
  currentCard: CompanionReviewCard | null;
  nextFsrsDueAt: string | null;
  nextReadingDueAt: string | null;
  queueNodeIds: string[];
  scheduledFsrsCount: number;
  scheduledReadingCount: number;
  totalCount: number;
}

function asWorkspaceNodes(snapshot: WorkspaceSnapshot) {
  return snapshot.nodesById as unknown as Record<string, Node>;
}

function normalizeTitle(title: string) {
  const trimmed = title.trim();
  return trimmed || 'Untitled';
}

function buildCurrentCard(snapshot: WorkspaceSnapshot, queueNodeIds: string[]) {
  const currentNodeId = queueNodeIds[0];
  if (!currentNodeId) {
    return null;
  }
  const node = snapshot.nodesById[currentNodeId];
  if (!node) {
    return null;
  }
  return {
    content: node.content,
    due: node.review?.due ?? node.reading?.nextAt ?? node.updatedAt,
    itemKind: getReviewItemKind(node as unknown as Node) === 'fsrs' ? 'fsrs' : 'reading',
    nodeId: currentNodeId,
    queuePosition: 1,
    remainingCount: queueNodeIds.length,
    reveal: node.reveal,
    title: normalizeTitle(node.title),
    totalCount: queueNodeIds.length
  } satisfies CompanionReviewCard;
}

function resolveScheduledReviewSummary(snapshot: WorkspaceSnapshot) {
  let nextFsrsDueAt: string | null = null;
  let nextReadingDueAt: string | null = null;
  let scheduledFsrsCount = 0;
  let scheduledReadingCount = 0;

  for (const nodeId of snapshot.nodeOrder) {
    if (snapshot.trashedNodeIds.includes(nodeId)) {
      continue;
    }
    const node = snapshot.nodesById[nodeId];
    if (!node) {
      continue;
    }
    if (isFsrsReviewItemNode(node as unknown as Node) && node.review?.due) {
      scheduledFsrsCount += 1;
      if (!nextFsrsDueAt || node.review.due.localeCompare(nextFsrsDueAt) < 0) {
        nextFsrsDueAt = node.review.due;
      }
    }
    if (node.kind === 'topic' && node.reading?.state === 'active' && node.reading.nextAt) {
      scheduledReadingCount += 1;
      if (!nextReadingDueAt || node.reading.nextAt.localeCompare(nextReadingDueAt) < 0) {
        nextReadingDueAt = node.reading.nextAt;
      }
    }
  }

  return {
    nextFsrsDueAt,
    nextReadingDueAt,
    scheduledFsrsCount,
    scheduledReadingCount
  };
}

export function resolveCompanionReviewSession(
  snapshot: WorkspaceSnapshot | null,
  now = new Date().toISOString()
): CompanionReviewSession {
  if (!snapshot) {
    return {
      currentCard: null,
      nextFsrsDueAt: null,
      nextReadingDueAt: null,
      queueNodeIds: [],
      scheduledFsrsCount: 0,
      scheduledReadingCount: 0,
      totalCount: 0
    };
  }

  const plan = buildReviewQueuePlan({
    nodeOrder: snapshot.nodeOrder,
    nodesById: asWorkspaceNodes(snapshot),
    now,
    trashedNodeIds: snapshot.trashedNodeIds
  });
  const queueNodeIds = plan.queueNodeIds.filter((nodeId) => {
    const node = asWorkspaceNodes(snapshot)[nodeId];
    return isFsrsReviewItemNode(node) || isReadingReviewItemNode(node);
  });
  const scheduledSummary = resolveScheduledReviewSummary(snapshot);

  return {
    currentCard: buildCurrentCard(snapshot, queueNodeIds),
    nextFsrsDueAt: scheduledSummary.nextFsrsDueAt,
    nextReadingDueAt: scheduledSummary.nextReadingDueAt,
    queueNodeIds,
    scheduledFsrsCount: scheduledSummary.scheduledFsrsCount,
    scheduledReadingCount: scheduledSummary.scheduledReadingCount,
    totalCount: queueNodeIds.length
  };
}

function toCompanionReviewResult(snapshot: WorkspaceSnapshot, now: string) {
  return {
    nextSession: resolveCompanionReviewSession(snapshot, now),
    snapshot
  };
}

export async function gradeCompanionReviewCard(args: {
  grade: ReviewGrade;
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  const now = args.now ?? new Date().toISOString();
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node || !isFsrsReviewItemNode(node as unknown as Node)) {
    return null;
  }

  const scheduler = createReviewSchedulerAdapter();
  const result = await scheduler.grade({
    card: toSchedulerCard(node.review, now),
    grade: args.grade,
    now
  });

  const nextSnapshot: WorkspaceSnapshot = {
    ...args.snapshot,
    nodesById: {
      ...args.snapshot.nodesById,
      [args.nodeId]: {
        ...node,
        review: {
          ...toNodeReviewProfile(result.card),
          lastReviewAt: result.reviewed_at
        },
        updatedAt: now
      }
    }
  };

  return {
    nextSession: resolveCompanionReviewSession(nextSnapshot, now),
    reviewedAt: result.reviewed_at,
    snapshot: nextSnapshot
  };
}

export function completeCompanionReadingReview(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  const now = args.now ?? new Date().toISOString();
  const nextSnapshot = completeCompanionReadingReviewBase({ ...args, now });
  return nextSnapshot ? toCompanionReviewResult(nextSnapshot, now) : null;
}

export function deferCompanionReadingReview(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  const now = args.now ?? new Date().toISOString();
  const nextSnapshot = deferCompanionReadingReviewBase({ ...args, now });
  return nextSnapshot ? toCompanionReviewResult(nextSnapshot, now) : null;
}

export function dismissCompanionReadingReview(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  const now = args.now ?? new Date().toISOString();
  const nextSnapshot = dismissCompanionReadingReviewBase({ ...args, now });
  return nextSnapshot ? toCompanionReviewResult(nextSnapshot, now) : null;
}
