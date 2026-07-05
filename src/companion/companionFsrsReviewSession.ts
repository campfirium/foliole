import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import { isFsrsReviewItemNode } from '../features/review/model/reviewItemKind';
import { selectCanonicalReviewQueueSource } from '../shared/workspaceCanonicalSelectors';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';

import {
  buildCurrentCard,
  emptyCompanionReviewSession,
  resolveScheduledReviewSummary,
  type CompanionReviewSession
} from './companionReviewSession';

export function resolveCompanionFsrsReviewSession(
  snapshot: WorkspaceSnapshot | null,
  now = new Date().toISOString()
): CompanionReviewSession {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) return emptyCompanionReviewSession();
  const plan = buildReviewQueuePlan({
    ...selectCanonicalReviewQueueSource(normalizedSnapshot),
    now,
  });
  const queueNodeIds = plan.queueNodeIds.filter((nodeId) => isFsrsReviewItemNode(normalizedSnapshot.nodesById[nodeId]));
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
