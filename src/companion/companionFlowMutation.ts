import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { applyCompanionFlowReceipt } from '../shared/platform/companion/runtime/companionDailyFlowDisplay';
import { commitCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';
import { isReviewProfileDue } from '../store/reviewQueuePlannerTime';
import { isWorkspacePartialPersistenceError } from '../store/workspacePersistenceFailure';
import type { ReviewSessionState } from '../store/workspaceStoreTypes';

import type { FlowAction } from './companionFlowHistoryEntry';
import { createCompanionFlowHistoryEntry, completedFlowReviewDay, type CompanionFlowHistoryContext } from './companionFlowHistoryEntry';
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
  session?: ReviewSessionState;
  partial: boolean;
  targetConfirmed: boolean;
};

export async function persistFlowMutation(args: {
  action: Exclude<FlowAction, 'soon'>; snapshot: WorkspaceSnapshot;
  nodeId: string; now: string; grade?: ReviewGrade;
  history?: CompanionFlowHistoryContext;
}): Promise<FlowMutation> {
  if (args.action === 'grade') {
    const result = await gradeCompanionReviewCard({ ...args, grade: args.grade! });
    if (!result) throw new Error('The current item is no longer available.');
    const saved = args.history ? await commitCompanionFlowHistory({ key: args.history.key, mode: args.history.mode,
      entry: createCompanionFlowHistoryEntry({ ...args, before: args.snapshot, after: result.snapshot, history: args.history }),
      reviewLog: result.reviewLog }) : await persistCompanionReviewSyncObject({ itemKind: 'fsrs',
        nodeId: args.nodeId, reviewLog: result.reviewLog, snapshot: result.snapshot });
    if (!saved) throw new Error('Could not save the review grade.');
    if (typeof saved === 'object' && 'session' in saved) await applyCompanionFlowReceipt(saved, args.snapshot);
    const snapshot = typeof saved === 'object' && 'card' in saved ? { ...result.snapshot,
      nodesById: { ...result.snapshot.nodesById, [args.nodeId]: { ...result.snapshot.nodesById[args.nodeId]!,
        review: saved.card ? toNodeReviewProfile(saved.card) : null } } } : result.snapshot;
    return { ...args, snapshot, ...(typeof saved === 'object' && 'session' in saved ? { session: saved.session } : {}), partial: false, targetConfirmed: true };
  }
  const apply = args.action === 'read' ? readCompanionReviewTopic
    : args.action === 'later' ? postponeCompanionReviewTopic : dismissCompanionReviewTopic;
  const snapshot = args.history?.session.daily && args.action !== 'dismiss'
    ? scopeReadingCalculation(args.snapshot, args.nodeId) : args.snapshot;
  const result = apply({ ...args, snapshot });
  if (!result) throw new Error('The current topic is no longer available.');
  if (args.history) {
    const saved = await commitCompanionFlowHistory({ key: args.history.key, mode: args.history.mode,
      entry: createCompanionFlowHistoryEntry({ ...args, before: args.snapshot, after: result.snapshot,
        relatedNodeIds: result.syncNodeIds, history: args.history }),
      ...(args.action === 'read' ? { completedReviewDay: completedFlowReviewDay(result.snapshot, args.nodeId) } : {}) });
    if (typeof saved === 'object' && 'session' in saved) await applyCompanionFlowReceipt(saved, args.snapshot);
    const changes = Object.fromEntries(result.syncNodeIds.map(id => [id, result.snapshot.nodesById[id]!]));
    if (typeof saved === 'object' && 'readings' in saved) for (const value of saved.readings ?? []) {
      if (changes[value.nodeId]) changes[value.nodeId] = { ...changes[value.nodeId]!, reading: value.reading };
    }
    let projection: WorkspaceSnapshot | undefined;
    return { ...args, get snapshot() {
      // Daily surfaces consume the committed receipt; only legacy callers need this projection.
      return projection ??= { ...args.snapshot, nodesById: patchWorkspaceRecord(args.snapshot.nodesById, changes) };
    }, ...(typeof saved === 'object' && 'session' in saved ? { session: saved.session } : {}), partial: false, targetConfirmed: true };
  }
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

// Reading schedule inheritance needs only the current node and its ancestors.
// The durable daily queue, rather than a renderer copy, owns successor selection.
function scopeReadingCalculation(snapshot: WorkspaceSnapshot, nodeId: string) {
  const nodesById: WorkspaceSnapshot['nodesById'] = {};
  let id: string | null = nodeId;
  while (id && !nodesById[id]) {
    const node: WorkspaceSnapshot['nodesById'][string] | undefined = snapshot.nodesById[id];
    if (!node) break;
    nodesById[id] = node;
    id = node.parentNodeId;
  }
  return { ...snapshot, nodesById, nodeOrder: [] };
}

export function confirmFlowMutation(mutation: FlowMutation, snapshot: WorkspaceSnapshot) {
  if (!mutation.partial) return mutation.targetConfirmed;
  const expected = mutation.snapshot.nodesById[mutation.nodeId]?.reading;
  const actual = snapshot.nodesById[mutation.nodeId]?.reading;
  return Boolean(expected && actual && expected.lastHandledAt === actual.lastHandledAt &&
    expected.nextAt === actual.nextAt && expected.state === actual.state &&
    expected.repetitionCount === actual.repetitionCount);
}
