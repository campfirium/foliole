import type { Node } from '../features/nodes/model/nodeTypes';

import {
  applyReadingSnapshot,
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid,
  isSameReadingProfile
} from './workspaceActionHistoryReading';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import {
  applyWorkspaceHistoryContext,
  isSameWorkspaceReviewSession
} from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
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
  const sourceContext = mode === 'undo' ? entry.afterContext : entry.beforeContext;
  return Boolean(
    node &&
    !state.trashedNodeIds.includes(entry.nodeId) &&
    isSameReadingProfile(node.reading, apply.expectedReading) &&
    areRelatedReadingsValid(apply.relatedReadings, state.nodesById) &&
    isSameWorkspaceReviewSession(state.reviewSession, sourceContext.reviewSession)
  );
}

function buildApplyNodes(
  state: WorkspaceState,
  entry: WorkspaceTopicDismissHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const apply = resolveTopicReadingHistoryApply(entry, mode);
  const node = state.nodesById[entry.nodeId]!;
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
  const prepared = buildApplyNodes(args.get(), args.entry, args.mode);
  try {
    const persisted = await getWorkspaceHistoryPersistence()
      .persistReadingSnapshots(prepared.nodes, args.mutationTimestamp);
    if (!persisted) return { status: 'failed' };
  } catch (error) {
    return { status: isWorkspacePartialPersistenceError(error) ? 'invalid' : 'failed' };
  }
  const latest = args.get();
  if (!isApplicable(latest, args.entry, args.mode)) return { status: 'invalid' };
  const applied = buildApplyNodes(latest, args.entry, args.mode);
  const context = args.mode === 'undo' ? args.entry.beforeContext : args.entry.afterContext;
  return appliedWorkspaceHistory({ ...args.entry, mutationTimestamp: args.mutationTimestamp }, {
    ...applyWorkspaceHistoryContext(context),
    nodesById: applied.nextNodesById
  });
}
