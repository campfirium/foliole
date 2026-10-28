import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { getReviewItemKind, isFsrsReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { gradeSharedFsrsReviewNode } from '../features/review/model/sharedReviewGradeService';
import { getCurrentReviewSchedulerSettings, getReviewSchedulerVersion } from '../features/settings/model/reviewSchedulerSettings';
import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import {
  selectCanonicalVisibleNodeIds
} from '../shared/workspaceCanonicalSelectors';

export interface CompanionReviewCard {
  content: string;
  due: string;
  hasAnswer: boolean;
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

export function emptyCompanionReviewSession(): CompanionReviewSession {
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

function normalizeTitle(title: string) {
  const trimmed = title.trim();
  return trimmed || translate(getStoredAppLocale(), 'desktop.search.context.untitled');
}

function hasReviewAnswer(node: WorkspaceSnapshot['nodesById'][string]) {
  return Boolean(node.reveal?.trim()) || Boolean((node as { hasReveal?: boolean }).hasReveal);
}

export function buildCurrentCard(snapshot: WorkspaceSnapshot, queueNodeIds: string[]) {
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
    hasAnswer: hasReviewAnswer(node),
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

export function resolveScheduledReviewSummary(snapshot: Pick<WorkspaceSnapshot,
  'nodesById' | 'nodeOrder' | 'trashedNodeIds' | 'trashedNodeDeletedAtById'>) {
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

export function hydrateCompanionReviewSession(
  session: CompanionReviewSession,
  article: { content: string; nodeId: string; reveal?: string | null; title: string } | null
): CompanionReviewSession {
  if (!session.currentCard || article?.nodeId !== session.currentCard.nodeId) return session;
  return {
    ...session,
    currentCard: {
      ...session.currentCard,
      content: article.content,
      reveal: article.reveal ?? null,
      title: article.title
    }
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
    reviewLog: result.reviewLog,
    reviewedAt: result.reviewedAt,
    snapshot: nextSnapshot
  };
}
