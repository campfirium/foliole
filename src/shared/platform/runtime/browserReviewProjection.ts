import { resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting } from '../../../../lib/core/review/nodeSettings';
import { replayReviewEventsFromBaseline } from '../../../../lib/core/review/recomputeReview';
import type { ReviewEvent } from '../../../../lib/core/review/recomputeReview';
import { reviewHistoryOpId } from '../../../../lib/core/review/reviewEventIdentity';
import { toNodeReviewProfile, toSchedulerCard } from '../../../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings } from '../../../features/settings/model/reviewSchedulerSettings';

import type { BrowserDailyFlowState } from './browserDailyFlowState';
import type { BrowserFlowWorkspace } from './browserDailyFlowStore';

type History = NonNullable<import('../../../../lib/core/flow/dailyFlowContract').DailyFlowCommitArgs['reviewHistory']>;
export function projectBrowserReview(workspace: BrowserFlowWorkspace, flow: BrowserDailyFlowState, nodeId: string) {
  const global = getCurrentReviewSchedulerSettings();
  const parameters = { ...global,
    desiredRetention: resolveNodeDesiredRetentionSetting(nodeId, workspace.nodesById, global.desiredRetention).value,
    enableShortTerm: resolveNodeShortTermSetting(nodeId, workspace.nodesById).value };
  const events = Object.values(flow.reviewEvents).filter(value => value.nodeId === nodeId).map(value => value.event);
  return replayReviewEventsFromBaseline(events, parameters, flow.reviewBases[nodeId] ?? null);
}

export function appendBrowserReviewHistory(flow: BrowserDailyFlowState, value: History, now: string) {
  const target = flow.reviewEvents[value.targetOpId];
  if (!target || target.nodeId !== value.nodeId || target.event.kind !== 'review') {
    if (!flow.legacyHistoryIds.includes(value.targetOpId)) throw new Error('review_history_record_missing');
    // Known version-zero commands carry their before/after profiles but no grade events.
    return { ...flow, reviewBases: { ...flow.reviewBases,
      [value.nodeId]: value.after ? toSchedulerCard(value.after, now) : null } };
  }
  const id = reviewHistoryOpId(value.targetOpId, now, value.mode);
  const event: ReviewEvent = { op_id: id, reviewed_at: now, kind: value.mode === 'undo' ? 'void' : 'review',
    grade: value.mode === 'undo' ? 0 : target.event.grade, voids_op_id: value.mode === 'undo' ? target.event.op_id : null };
  return { ...flow, reviewEvents: { ...flow.reviewEvents, [id]: { nodeId: value.nodeId, schedulerVersion: value.mode === 'undo' ? '' : target.schedulerVersion, event } } };
}

export function captureBrowserReviewBases(flow: BrowserDailyFlowState, nodes: BrowserFlowWorkspace['nodesById']) {
  const additions = Object.values(nodes).filter(node => node.kind === 'item' && !Object.hasOwn(flow.reviewBases, node.id));
  if (!additions.length) return flow;
  return { ...flow, reviewBases: { ...flow.reviewBases, ...Object.fromEntries(additions.map(node =>
    [node.id, node.review ? toSchedulerCard(node.review, node.createdAt) : null])) } };
}

export const browserReviewProfile = (card: ReturnType<typeof projectBrowserReview>) => card ? toNodeReviewProfile(card) : null;
