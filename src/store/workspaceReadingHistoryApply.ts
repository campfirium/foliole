import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { DailyFlowLearningReceipt } from '../../lib/core/flow/dailyFlowContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import {
  applyReadingSnapshot,
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid,
  isSameReadingProfile
} from './workspaceActionHistoryReading';
import { hasPersistentDailyFlow, hasTargetedDailyFlow, saveDailyHistory } from './workspaceDailyFlowMutations';
import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import {
  applyWorkspaceHistoryContext,
  isSameWorkspaceReviewSession
} from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { isSameNodeReading } from './workspaceNodeLearningComparison';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import type { WorkspaceState } from './workspaceStore';
import {
  resolveTopicReadingHistoryApply,
  type WorkspaceTopicDismissHistoryEntry
} from './workspaceTopicDismissActionHistory';

function isApplicable(
  state: WorkspaceState,
  entry: WorkspaceTopicDismissHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const apply = resolveTopicReadingHistoryApply(entry, mode);
  const node = state.nodesById[entry.nodeId];
  const targeted = !entry.standalone && hasTargetedDailyFlow(state.reviewSession) && entry.afterContext.reviewSession.flowFormat === 'cycle-v1';
  const sourceContext = mode === 'undo' ? entry.afterContext : entry.beforeContext;
  return Boolean(
    node &&
    !state.trashedNodeIds.includes(entry.nodeId) &&
    (targeted || (isSameNodeReading(node, { reading: apply.expectedReading }) &&
    areRelatedReadingsValid(apply.relatedReadings, state.nodesById) &&
    isSameWorkspaceReviewSession(state.reviewSession, sourceContext.reviewSession)))
  );
}

function buildApplyNodes(
  state: WorkspaceState,
  entry: WorkspaceTopicDismissHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const apply = resolveTopicReadingHistoryApply(entry, mode);
  const node = state.nodesById[entry.nodeId]!;
  if (!entry.standalone && hasTargetedDailyFlow(state.reviewSession) && entry.afterContext.reviewSession.flowFormat === 'cycle-v1') {
    return { nextNodesById: state.nodesById, nodes: [node] };
  }
  const nextNodesById = {
    ...state.nodesById,
    [entry.nodeId]: applyReadingSnapshot(node, apply.nextReading)
  };
  applyRelatedReadingSnapshots({ nextNodesById, readings: apply.relatedReadings });
  const nodes = [entry.nodeId, ...apply.relatedReadings.map(({ nodeId }) => nodeId)]
    .map((nodeId) => nextNodesById[nodeId])
    .filter((nextNode): nextNode is Node => Boolean(nextNode));
  return { nextNodesById, nodes };
}

export async function applyWorkspaceReadingHistory(args: {
  entry: WorkspaceTopicDismissHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
}): Promise<WorkspaceHistoryApplyResult> {
  if (!isApplicable(args.get(), args.entry, args.mode)) return { status: 'invalid' };
  if (args.entry.standalone) {
    const state = args.get();
    const apply = resolveTopicReadingHistoryApply(args.entry, args.mode);
    const ids = [args.entry.nodeId, ...apply.relatedReadings.map(value => value.nodeId)];
    const nodes = await readWorkspaceOperationLearning(state.nodesById, ids, state.libraryScope ?? state.reviewSession.daily?.scope);
    if (!nodes || args.get().libraryScope !== state.libraryScope ||
      !isSameReadingProfile(nodes[args.entry.nodeId]?.reading, apply.expectedReading) ||
      !areRelatedReadingsValid(apply.relatedReadings, nodes)) return { status: 'invalid' };
  }
  const prepared = buildApplyNodes(args.get(), args.entry, args.mode);
  let dailySession: WorkspaceState['reviewSession'] | undefined;
  const beforeNodes = args.get().nodesById;
  let learning: Record<string, DailyFlowLearningReceipt> | undefined;
  let displayNodes: Record<string, WorkspaceNodeSnapshot> | undefined;
  try {
    const persisted = !args.entry.standalone && hasPersistentDailyFlow(args.get().reviewSession)
      ? await saveDailyHistory({ session: args.get().reviewSession, entry: args.entry, mode: args.mode, now: args.mutationTimestamp, knownNodes: args.get().nodesById })
      : await getWorkspaceHistoryPersistence()
      .persistReadingSnapshots(prepared.nodes, args.mutationTimestamp);
    if (!persisted) return { status: 'failed' };
    if (typeof persisted !== 'boolean') {
      dailySession = persisted.session;
      displayNodes = persisted.nodes;
      learning = persisted.learning;
      args.mutationTimestamp = persisted.mutationTimestamp ?? args.mutationTimestamp;
    }
  } catch (error) {
    return { status: isWorkspacePartialPersistenceError(error) ? 'invalid' : 'failed' };
  }
  const latest = args.get();
  const affectedIds = [args.entry.nodeId, ...(args.entry.relatedReadings ?? []).map(value => value.nodeId)];
  if (affectedIds.some(nodeId => !isSameNodeReading(beforeNodes[nodeId], latest.nodesById[nodeId]))) {
    return { status: 'invalid' };
  }
  if (!isApplicable(latest, args.entry, args.mode)) return { status: 'invalid' };
  const applied = buildApplyNodes(latest, args.entry, args.mode);
  const context = args.mode === 'undo' ? args.entry.beforeContext : args.entry.afterContext;
  return appliedWorkspaceHistory({ ...args.entry, mutationTimestamp: args.mutationTimestamp }, {
    ...applyWorkspaceHistoryContext(context),
    ...(dailySession ? { reviewSession: dailySession } : {}),
    nodesById: mergeDailyFlowReceiptNodes(applied.nextNodesById, beforeNodes, displayNodes, learning)
  });
}
