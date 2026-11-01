import type { WorkspaceActionHistoryEntry } from './workspaceActionHistoryEntry';
import { removeApplicationOperation, updateApplicationOperation } from './workspaceApplicationHistory';
import { admitWorkspaceApplication, projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import type { WorkspaceState } from './workspaceStoreTypes';
import { createStructureRenameEntry, isWorkspaceStructureKind } from './workspaceStructureHistoryEntries';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export function admitApplicationAction(set: Set, entry: WorkspaceActionHistoryEntry) {
  let admitted = false;
  set(state => {
    if (!state.appActionHistory.application) return state;
    admitted = true;
    return { appActionHistory: admitWorkspaceApplication(state.appActionHistory, entry, false) };
  });
  return admitted;
}

/** A receipt can confirm only its existing admission, including after later input or eviction. */
export function settleApplicationAction(state: WorkspaceState, entryId: string, entry: WorkspaceActionHistoryEntry | null): Partial<WorkspaceState> {
  const history = state.appActionHistory;
  const application = history.application;
  if (!application) return {};
  const previous = [...application.undo, ...application.redo].find(value => value.id === entryId);
  if (!previous || previous.domain !== 'workspace') return {};
  const next = entry ? updateApplicationOperation(application, { ...previous, entry: { ...entry, id: entryId }, ready: true })
    : removeApplicationOperation(application, entryId);
  return { appActionHistory: projectApplicationWorkspaceHistory({ ...history,
    ...(history.pendingAction?.entry.id === entryId ? { pendingAction: null } : {}),
    ...(history.pendingCreate?.entry.id === entryId ? { pendingCreate: null } : {}) }, next) };
}

export function admitApplicationTitle(set: Set, nodeId: string, title: string) {
  let entry: ReturnType<typeof createStructureRenameEntry> | undefined;
  let libraryScope: WorkspaceState['libraryScope'];
  set(state => {
    libraryScope = state.libraryScope;
    const node = state.nodesById[nodeId];
    if (state.appActionHistory.application && node && isWorkspaceStructureKind(node.kind) && node.title !== title.trim())
      entry = createStructureRenameEntry({ nodeId, kind: node.kind, beforeTitle: node.title, afterTitle: title.trim() });
    return state;
  });
  if (entry) admitApplicationAction(set, entry);
  return { entry, libraryScope };
}
