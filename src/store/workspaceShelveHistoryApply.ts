import type { Node } from '../features/nodes/model/nodeTypes';

import {
  applyRelatedReadingSnapshots,
  areRelatedReadingsValid
} from './workspaceActionHistoryReading';
import { appliedWorkspaceHistory, type WorkspaceHistoryApplyResult } from './workspaceHistoryApplyResult';
import {
  applyWorkspaceHistoryContext,
  isSameWorkspaceReviewSession
} from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import type { WorkspaceTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';

function resolveApply(entry: WorkspaceTopicShelveHistoryEntry, mode: 'redo' | 'undo') {
  return {
    expectedShelvedAt: mode === 'undo' ? entry.afterShelvedAt : entry.beforeShelvedAt,
    nextShelvedAt: mode === 'undo' ? entry.beforeShelvedAt : entry.afterShelvedAt,
    relatedReadings: (entry.relatedReadings ?? []).map((reading) => ({
      expectedReading: (mode === 'undo' ? reading.afterReading : reading.beforeReading) ?? null,
      nextReading: (mode === 'undo' ? reading.beforeReading : reading.afterReading) ?? null,
      nodeId: reading.nodeId
    }))
  };
}

function isApplicable(state: WorkspaceState, entry: WorkspaceTopicShelveHistoryEntry, mode: 'redo' | 'undo') {
  const apply = resolveApply(entry, mode);
  const node = state.nodesById[entry.nodeId];
  const sourceContext = mode === 'undo' ? entry.afterContext : entry.beforeContext;
  return Boolean(node &&
    !state.trashedNodeIds.includes(entry.nodeId) &&
    (node.shelvedAt ?? null) === apply.expectedShelvedAt &&
    areRelatedReadingsValid(apply.relatedReadings, state.nodesById) &&
    isSameWorkspaceReviewSession(state.reviewSession, sourceContext.reviewSession));
}

function buildApplyNodes(
  state: WorkspaceState,
  entry: WorkspaceTopicShelveHistoryEntry,
  mode: 'redo' | 'undo',
  mutationTimestamp: string
) {
  const apply = resolveApply(entry, mode);
  const nextNode = {
    ...state.nodesById[entry.nodeId]!,
    shelvedAt: apply.nextShelvedAt,
    updatedAt: mutationTimestamp
  };
  const nextNodesById = { ...state.nodesById, [entry.nodeId]: nextNode };
  applyRelatedReadingSnapshots({ nextNodesById, readings: apply.relatedReadings });
  const nodes = [entry.nodeId, ...apply.relatedReadings.map(({ nodeId }) => nodeId)]
    .map((nodeId) => nextNodesById[nodeId])
    .filter((node): node is Node => Boolean(node));
  return { nextNodesById, nodes };
}

export async function applyWorkspaceShelveHistory(args: {
  entry: WorkspaceTopicShelveHistoryEntry;
  get: () => WorkspaceState;
  mode: 'redo' | 'undo';
  mutationTimestamp: string;
}): Promise<WorkspaceHistoryApplyResult> {
  if (!isApplicable(args.get(), args.entry, args.mode)) return { status: 'invalid' };
  const prepared = buildApplyNodes(args.get(), args.entry, args.mode, args.mutationTimestamp);
  try {
    const persisted = await getWorkspaceHistoryPersistence()
      .persistShelveSnapshots(prepared.nodes, args.mutationTimestamp);
    if (!persisted) return { status: 'failed' };
  } catch (error) {
    return { status: isWorkspacePartialPersistenceError(error) ? 'invalid' : 'failed' };
  }
  const latest = args.get();
  if (!isApplicable(latest, args.entry, args.mode)) return { status: 'invalid' };
  const applied = buildApplyNodes(latest, args.entry, args.mode, args.mutationTimestamp);
  const context = args.mode === 'undo' ? args.entry.beforeContext : args.entry.afterContext;
  return appliedWorkspaceHistory({ ...args.entry, mutationTimestamp: args.mutationTimestamp }, {
    ...applyWorkspaceHistoryContext(context),
    nodesById: applied.nextNodesById
  });
}
