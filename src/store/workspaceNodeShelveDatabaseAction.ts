import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { beginWorkspaceAction, createEmptyWorkspaceActionHistory, failWorkspaceAction, settleWorkspaceAction } from './workspaceActionHistory';
import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { sourcePreferences } from './workspaceDailyFlowSourceSettingsActions';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import { captureWorkspaceHistoryContext, isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { isSameNodeReading } from './workspaceNodeLearningComparison';
import { readWorkspaceShelveLearning, workspaceShelveLearningNodeIds } from './workspaceNodeShelveLearning';
import { createTopicShelveHistoryEntry, type WorkspaceTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import { saveDatabaseShelveCommand } from './workspaceShelveDatabaseCommand';
import type { WorkspaceState } from './workspaceStoreTypes';

const libraryScope = (state: WorkspaceState) => state.libraryScope ?? state.reviewSession.daily?.scope;

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;
type Args = { set: Set; get: () => WorkspaceState; nodeId: string; now: string; mode: 'shelve' | 'unshelve';
  eligible: (node: Node | undefined, state: WorkspaceState) => boolean;
  buildMutation: (args: { nodeId: string; now: string; mode: 'shelve' | 'unshelve'; state: WorkspaceState }) => {
    changes: NonNullable<WorkspaceTopicShelveHistoryEntry['relatedReadings']>; } | null };

export function beginDatabaseShelveAction(args: Args) {
  const before = args.get();
  const pending = before.appActionHistory.pendingAction?.entry;
  if (pending?.type === 'topic.shelve' && pending.databaseMutation?.scope === libraryScope(before) && pending.nodeId === args.nodeId &&
    Boolean(pending.afterShelvedAt) === (args.mode === 'shelve')) {
    if (pending.relatedReadings !== undefined) void persistDatabaseShelve(args, pending);
    return true;
  }
  const node = before.nodesById[args.nodeId];
  const scope = before.libraryScope ?? before.reviewSession.daily?.scope;
  if (!scope || !args.eligible(node, before) || before.appActionHistory.applying || before.appActionHistory.pendingAction ||
    before.appActionHistory.pendingCreate || (args.mode === 'unshelve' && !node?.shelvedAt)) return false;
  const entry = createTopicShelveHistoryEntry({ nodeId: args.nodeId, id: createWorkspaceActionHistoryEntryId(),
    beforeShelvedAt: node!.shelvedAt ?? null, afterShelvedAt: args.mode === 'shelve' ? args.now : null,
    beforeContext: captureWorkspaceHistoryContext(before), afterContext: captureWorkspaceHistoryContext(before), mutationTimestamp: args.now });
  entry.databaseMutation = { scope, before: sourcePreferences(node!), defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority };
  acceptWorkspaceHistoryCommand(args.set, 'preserve', state => ({ appActionHistory: beginWorkspaceAction(state.appActionHistory, entry) }));
  void prepareDatabaseShelve(args, entry, before);
  return true;
}

async function prepareDatabaseShelve(args: Args, entry: WorkspaceTopicShelveHistoryEntry, before: WorkspaceState) {
  const prepared = await readWorkspaceShelveLearning(before, args.nodeId);
  const latest = args.get();
  if (!prepared || libraryScope(latest) !== entry.databaseMutation!.scope || latest.appActionHistory.pendingAction?.entry.id !== entry.id ||
    (latest.nodesById[args.nodeId]?.shelvedAt ?? null) !== entry.beforeShelvedAt) {
    args.set(state => state.appActionHistory.pendingAction?.entry.id === entry.id
      ? { appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id) } : {});
    return;
  }
  const nodesById = { ...latest.nodesById };
  if (workspaceShelveLearningNodeIds(latest, args.nodeId).some(id => !prepared.nodeIds.includes(id)) ||
    prepared.nodeIds.some(id => !isSameNodeReading(latest.nodesById[id], before.nodesById[id]))) {
    args.set(state => ({ appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id) }));
    return;
  }
  for (const id of prepared.nodeIds) if (nodesById[id]) nodesById[id] = { ...nodesById[id]!,
    reading: prepared.nodesById[id]!.reading ?? null, review: prepared.nodesById[id]!.review ?? null };
  const mutation = args.buildMutation({ ...args, state: { ...latest, nodesById } });
  if (!mutation || mutation.changes.some(value => !prepared.nodeIds.includes(value.nodeId))) {
    args.set(state => ({ appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id) }));
    return;
  }
  entry.relatedReadings = mutation.changes;
  entry.databaseMutation!.before = sourcePreferences(latest.nodesById[entry.nodeId]!);
  await persistDatabaseShelve(args, entry);
}

async function persistDatabaseShelve(args: Args, entry: WorkspaceTopicShelveHistoryEntry) {
  const before = args.get();
  if (libraryScope(before) !== entry.databaseMutation!.scope) return;
  try {
    const saved = await saveDatabaseShelveCommand(entry, 'redo', entry.mutationTimestamp, entry.databaseMutation!.before, before.nodesById);
    let undoRequested = false;
    args.set(state => {
      if (libraryScope(state) !== entry.databaseMutation!.scope || state.appActionHistory.pendingAction?.entry.id !== entry.id) return {};
      const nodesById = { ...state.nodesById };
      for (const value of saved.readings) if (nodesById[value.nodeId] &&
        isSameNodeReading(nodesById[value.nodeId], before.nodesById[value.nodeId])) {
        nodesById[value.nodeId] = { ...nodesById[value.nodeId]!, reading: value.reading };
      }
      const node = nodesById[entry.nodeId];
      if (node) nodesById[entry.nodeId] = { ...node, shelvedAt: entry.afterShelvedAt, updatedAt: saved.updatedAt };
      if (!isSameWorkspaceReviewSession(state.reviewSession, entry.beforeContext.reviewSession)) {
        return { nodesById, appActionHistory: createEmptyWorkspaceActionHistory() };
      }
      entry.afterContext = captureWorkspaceHistoryContext(state);
      const settled = settleWorkspaceAction(state.appActionHistory, entry.id);
      undoRequested = settled.undoRequested;
      return { nodesById, appActionHistory: settled.history };
    });
    if (undoRequested) args.get().undoWorkspaceAction(entry.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/daily_flow_(source|library)_changed/.test(message)) args.set(state => state.appActionHistory.pendingAction?.entry.id === entry.id
      ? { appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id) } : {});
    if (libraryScope(args.get()) === entry.databaseMutation!.scope) showAppRuntimeNotice('Could not save this change. Please try again.');
  }
}
