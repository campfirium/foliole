import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import { cycleReadyNodeIds } from '../../lib/core/flow/cycleFlowSelection';
import { prepareFlowSession } from '../../lib/core/flow/dailyFlowPlanning';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildCurrentCard, emptyCompanionReviewSession, resolveScheduledReviewSummary } from './companionReviewSession';

function project(snapshot: WorkspaceSnapshot | null, now: string, mode: ReviewSessionMode) {
  if (!snapshot) return emptyCompanionReviewSession();
  const normalized = normalizeWorkspaceSnapshot(snapshot);
  const settings = getCurrentReviewSchedulerSettings();
  const initial = prepareFlowSession(normalized, { now, mode, prepareOnly: true }, settings);
  const queueNodeIds = [...new Set([...initial.queueNodeIds, ...cycleReadyNodeIds(normalized, mode, now, settings)])];
  return { currentCard: buildCurrentCard(normalized, queueNodeIds), queueNodeIds,
    totalCount: queueNodeIds.length, ...resolveScheduledReviewSummary(normalized) };
}
export const resolveCompanionReviewSession = (snapshot: WorkspaceSnapshot | null, now: string) => project(snapshot, now, 'recommended');
export const resolveCompanionFsrsReviewSession = (snapshot: WorkspaceSnapshot | null, now: string) => project(snapshot, now, 'review-first');
