import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { isReviewProfileDue } from '../store/reviewQueuePlannerTime';
import type { FlowAction } from '../store/workspaceFlowSession';
import { isWorkspacePartialPersistenceError } from '../store/workspacePersistenceFailure';

import { dismissCompanionReviewTopic, postponeCompanionReviewTopic, readCompanionReviewTopic } from './companionReadingReview';
import { gradeCompanionReviewCard } from './companionReviewSession';
import { persistCompanionReviewSyncObject } from './companionReviewSyncPersistence';

export function isCompanionGradeDue(snapshot: WorkspaceSnapshot, nodeId: string, now: string) {
  return isReviewProfileDue(snapshot.nodesById[nodeId]?.review, now,
    getCurrentReviewSchedulerSettings().newDayStartsAtHour);
}

export type FlowMutation = {
  snapshot: WorkspaceSnapshot;
  action: FlowAction;
  nodeId: string;
  now: string;
  partial: boolean;
  targetConfirmed: boolean;
};

export async function persistFlowMutation(args: {
  action: Exclude<FlowAction, 'soon'>; snapshot: WorkspaceSnapshot;
  nodeId: string; now: string; grade?: ReviewGrade;
}): Promise<FlowMutation> {
  if (args.action === 'grade') {
    const result = await gradeCompanionReviewCard({ ...args, grade: args.grade! });
    if (!result) throw new Error('The current item is no longer available.');
    const saved = await persistCompanionReviewSyncObject({ itemKind: 'fsrs',
      nodeId: args.nodeId, reviewLog: result.reviewLog, snapshot: result.snapshot });
    if (!saved) throw new Error('Could not save the review grade.');
    return { ...args, snapshot: result.snapshot, partial: false, targetConfirmed: true };
  }
  const apply = args.action === 'read' ? readCompanionReviewTopic
    : args.action === 'later' ? postponeCompanionReviewTopic : dismissCompanionReviewTopic;
  const result = apply(args);
  if (!result) throw new Error('The current topic is no longer available.');
  try {
    const saved = await persistCompanionReviewSyncObject({ itemKind: 'reading', completedReading: args.action === 'read',
      nodeId: args.nodeId, nodeIds: result.syncNodeIds, snapshot: result.snapshot });
    if (!saved) throw new Error('Could not save the reading action.');
    return { ...args, snapshot: result.snapshot, partial: false, targetConfirmed: true };
  } catch (error) {
    if (!isWorkspacePartialPersistenceError(error)) throw error;
    return { ...args, snapshot: result.snapshot, partial: true, targetConfirmed: false };
  }
}

export function confirmFlowMutation(mutation: FlowMutation, snapshot: WorkspaceSnapshot) {
  if (!mutation.partial) return mutation.targetConfirmed;
  const expected = mutation.snapshot.nodesById[mutation.nodeId]?.reading;
  const actual = snapshot.nodesById[mutation.nodeId]?.reading;
  return Boolean(expected && actual && expected.lastHandledAt === actual.lastHandledAt &&
    expected.nextAt === actual.nextAt && expected.state === actual.state &&
    expected.repetitionCount === actual.repetitionCount);
}
