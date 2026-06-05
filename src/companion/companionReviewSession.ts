import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import { getReviewItemKind, isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { gradeSharedFsrsReviewNode } from '../features/review/model/sharedReviewGradeService';
import { getCurrentReviewSchedulerSettings, getReviewSchedulerVersion } from '../features/settings/model/reviewSchedulerSettings';
import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import {
  selectCanonicalReviewQueueSource,
  selectCanonicalVisibleNodeIds
} from '../shared/workspaceCanonicalSelectors';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';

import {
  readCompanionReviewTopic as readCompanionReviewTopicBase,
  postponeCompanionReviewTopic as postponeCompanionReviewTopicBase,
  dismissCompanionReviewTopic as dismissCompanionReviewTopicBase
} from './companionReadingReview';

export interface CompanionReviewCard {
  content: string;
  due: string;
  hideTitleHeading: boolean;
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

function normalizeTitle(title: string) {
  const trimmed = title.trim();
  return trimmed || translate(getStoredAppLocale(), 'desktop.search.context.untitled');
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
    hideTitleHeading: Boolean(node.hideTitleHeading),
    itemKind: getReviewItemKind(node) === 'fsrs' ? 'fsrs' : 'reading',
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

  for (const nodeId of selectCanonicalVisibleNodeIds(snapshot)) {
    const node = snapshot.nodesById[nodeId];
    if (!node) {
      continue;
    }
    if (isFsrsReviewItemNode(node) && node.review?.due) {
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

function resolveCompanionQueueNodeIds(plan: ReturnType<typeof buildReviewQueuePlan>) {
  return [...new Set([...plan.queueNodeIds, ...plan.readingQueueNodeIds])];
}

export function resolveCompanionReviewSession(
  snapshot: WorkspaceSnapshot | null,
  now = new Date().toISOString()
): CompanionReviewSession {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) {
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
    ...selectCanonicalReviewQueueSource(normalizedSnapshot),
    now,
  });
  const queueNodeIds = resolveCompanionQueueNodeIds(plan).filter((nodeId) => {
    const node = normalizedSnapshot.nodesById[nodeId];
    return isFsrsReviewItemNode(node) || isReadingReviewItemNode(node);
  });
  const scheduledSummary = resolveScheduledReviewSummary(normalizedSnapshot);

  return {
    currentCard: buildCurrentCard(normalizedSnapshot, queueNodeIds),
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

function applyCompanionReadingReviewTopic(
  action: (args: { nodeId: string; now: string; snapshot: WorkspaceSnapshot }) => WorkspaceSnapshot | null,
  args: { nodeId: string; now?: string; snapshot: WorkspaceSnapshot }
) {
  const now = args.now ?? new Date().toISOString();
  const nextSnapshot = action({ ...args, now });
  return nextSnapshot ? toCompanionReviewResult(nextSnapshot, now) : null;
}

export async function gradeCompanionReviewCard(args: {
  grade: ReviewGrade;
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  const now = args.now ?? new Date().toISOString();
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node || !isFsrsReviewItemNode(node)) {
    return null;
  }

  const scheduler = createReviewSchedulerAdapter();
  const result = await gradeSharedFsrsReviewNode({
    getSchedulerVersion: (overrides) => getReviewSchedulerVersion(getCurrentReviewSchedulerSettings(), overrides),
    grade: args.grade,
    newDayStartsAtHour: getCurrentReviewSchedulerSettings().newDayStartsAtHour,
    nodeId: args.nodeId,
    nodesById: args.snapshot.nodesById,
    now,
    scheduler
  });
  if (!result) {
    return null;
  }

  const nextSnapshot: WorkspaceSnapshot = {
    ...args.snapshot,
    nodesById: {
      ...args.snapshot.nodesById,
      [args.nodeId]: {
        ...node,
        ...result.nodePatch
      }
    }
  };

  return {
    nextSession: resolveCompanionReviewSession(nextSnapshot, now),
    reviewLog: result.reviewLog,
    reviewedAt: result.reviewedAt,
    snapshot: nextSnapshot
  };
}

export function readCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return applyCompanionReadingReviewTopic(readCompanionReviewTopicBase, args);
}

export function postponeCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return applyCompanionReadingReviewTopic(postponeCompanionReviewTopicBase, args);
}

export function dismissCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return applyCompanionReadingReviewTopic(dismissCompanionReviewTopicBase, args);
}
