import { compactFlowHistoryEntry } from '../../lib/core/flow/flowHistoryEntry';

import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import type { WorkspaceActionHistoryState } from './workspaceActionHistoryState';
import { admitApplicationOperation, removeApplicationOperation, updateApplicationOperation,
  type ApplicationHistory, type ApplicationOperation } from './workspaceApplicationHistory';

export function projectApplicationWorkspaceHistory<Entry>(history: WorkspaceActionHistoryState<Entry>, application: ApplicationHistory): WorkspaceActionHistoryState<Entry> {
  const project = (stack: ApplicationOperation[]) => stack.flatMap(operation => operation.domain === 'workspace' && operation.ready ? [operation.entry as Entry] : []);
  const request = application.requests[0];
  return { ...history, application, applying: request && request.stage !== 'reserved'
    ? { entryId: request.operationId, mode: request.direction } : null, undoStack: project(application.undo), redoStack: project(application.redo) };
}

export function admitWorkspaceApplication<Entry>(history: WorkspaceActionHistoryState<Entry>, entry: WorkspaceActionHistoryEntry, ready: boolean) {
  const application = history.application!;
  const previous = [...application.undo, ...application.redo].find(value => value.id === entry.id);
  const operation: ApplicationOperation = { id: entry.id, domain: 'workspace', entry: compactFlowHistoryEntry(entry), ready, order: previous?.order ?? 0 };
  return projectApplicationWorkspaceHistory(history, previous
    ? updateApplicationOperation(application, operation) : admitApplicationOperation(application, operation));
}

export function removeWorkspaceApplication(history: WorkspaceActionHistoryState, entryId: string) {
  return projectApplicationWorkspaceHistory(history, removeApplicationOperation(history.application!, entryId));
}

/** Keep grade expectation and due-date repairs produced by the existing domain calculation. */
export function publishWorkspaceApplicationPayloads(history: WorkspaceActionHistoryState, computed: WorkspaceActionHistoryState) {
  let application = history.application!;
  for (const entry of [...computed.undoStack, ...computed.redoStack]) {
    const operation = [...application.undo, ...application.redo].find(value => value.id === entry.id);
    if (operation?.domain === 'workspace') application = updateApplicationOperation(application, { ...operation, entry });
  }
  return projectApplicationWorkspaceHistory({ ...computed, applying: null }, application);
}
