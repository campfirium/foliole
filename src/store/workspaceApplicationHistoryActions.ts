import { markApplicationReplaySubmitted, reserveApplicationReplay, settleApplicationReplay, startApplicationReplay,
  type HistoryDirection } from './workspaceApplicationHistory';
import { applyApplicationHistoryEntry } from './workspaceApplicationHistoryEntryApply';
import { finishApplicationReplayFailure } from './workspaceApplicationReplayFailure';
import { restoreApplicationNode } from './workspaceApplicationRestore';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export function createApplicationHistoryActions(set: Set, get: () => WorkspaceState) {
  let running: { sessionId: string; controller: AbortController } | undefined;
  const contexts = new Map<string, EditorOperationApplyContext>();
  const write = (application: NonNullable<WorkspaceState['appActionHistory']['application']>) =>
    set(state => ({ appActionHistory: projectApplicationWorkspaceHistory(state.appActionHistory, application) }));
  const wake = () => {
    running = retireReplayScope(running, get().appActionHistory.application?.sessionId, contexts);
    queueMicrotask(() => { void run(); });
  };
  const reserve = (direction: HistoryDirection, context?: EditorOperationApplyContext) => {
    const history = get().appActionHistory.application;
    if (!history) return false;
    const next = reserveApplicationReplay(history, direction);
    if (next === history) return false;
    const request = next.requests.at(-1)!;
    if (context) contexts.set(request.id, context);
    write(next);
    wake();
    return true;
  };
  async function run() {
    const before = get().appActionHistory.application;
    if (!before || running?.sessionId === before.sessionId) return;
    const history = startApplicationReplay(before);
    if (history === before) return;
    const request = history.requests[0]!;
    const operation = [...history.undo, ...history.redo].find(value => value.id === request.operationId)!;
    const controller = new AbortController();
    running = { sessionId: history.sessionId, controller };
    write(history);
    const current = () => get().appActionHistory.application?.sessionId === history.sessionId &&
      get().appActionHistory.application?.requests[0]?.id === request.id;
    const beforeSubmit = () => {
      if (!current()) return false;
      write(markApplicationReplaySubmitted(get().appActionHistory.application!, request.id));
      return true;
    };
    try {
      const result = await applyApplicationHistoryEntry({ operation, request, current, beforeSubmit, get, set, signal: controller.signal,
        ...(contexts.get(request.id) ? { context: contexts.get(request.id)! } : {}) });
      if (current()) {
        if (result) write(settleApplicationReplay(get().appActionHistory.application!, request.id, { status: 'committed', operation: result }));
        else await finishApplicationReplayFailure({ get, set, operation, request, sessionId: history.sessionId });
      }
    } catch {
      if (current()) await finishApplicationReplayFailure({ get, set, operation, request, sessionId: history.sessionId });
    } finally {
      contexts.delete(request.id);
      for (const id of contexts.keys()) if (!get().appActionHistory.application?.requests.some(value => value.id === id)) contexts.delete(id);
      if (running?.controller === controller) running = undefined;
      wake();
    }
  }
  return { wakeApplicationHistory: wake, restoreApplicationNode: (nodeId: string) => restoreApplicationNode(set, get, nodeId),
    undoApplicationOperation: (context?: EditorOperationApplyContext) => reserve('undo', context),
    redoApplicationOperation: (context?: EditorOperationApplyContext) => reserve('redo', context) };
}

function retireReplayScope(running: { sessionId: string; controller: AbortController } | undefined,
  sessionId: string | undefined, contexts: Map<string, EditorOperationApplyContext>) {
  if (running && running.sessionId !== sessionId) {
    running.controller.abort();
    contexts.clear();
    return undefined;
  }
  return running;
}
