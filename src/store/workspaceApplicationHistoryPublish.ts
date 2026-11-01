import { createEmptyEditorOperationHistory } from '../features/editor/model/editorOperationHistory';

import { createEmptyWorkspaceActionHistory } from './workspaceActionHistoryState';
import { projectApplicationEditorHistory } from './workspaceApplicationEditorHistory';
import { createApplicationHistory } from './workspaceApplicationHistory';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import type { WorkspaceState } from './workspaceStoreTypes';

/** Both domain histories are read views of the same application sequence. */
export function publishApplicationHistories<T extends Partial<WorkspaceState>>(patch: T, current: WorkspaceState): T {
  const currentOwner = current.appActionHistory.application;
  const editorOwner = patch.editorOperationHistory?.application;
  const workspaceOwner = patch.appActionHistory?.application;
  const application = editorOwner && editorOwner !== currentOwner ? editorOwner : workspaceOwner ?? currentOwner;
  if (!application) return patch;
  const explicitReset = patch.appActionHistory && !workspaceOwner && patch.editorOperationHistory && !editorOwner
    && !patch.appActionHistory.undoStack.length && !patch.appActionHistory.redoStack.length
    && !Object.keys(patch.editorOperationHistory.sessionsByNodeId).length;
  if (explicitReset || ('libraryScope' in patch && patch.libraryScope !== current.libraryScope)) {
    const next = createApplicationHistory();
    return { ...patch, appActionHistory: projectApplicationWorkspaceHistory(createEmptyWorkspaceActionHistory(), next),
      editorOperationHistory: projectApplicationEditorHistory(createEmptyEditorOperationHistory(), next) };
  }
  if (application === currentOwner && !patch.appActionHistory && !patch.editorOperationHistory) return patch;
  return { ...patch,
    appActionHistory: projectApplicationWorkspaceHistory(patch.appActionHistory ?? current.appActionHistory, application),
    editorOperationHistory: projectApplicationEditorHistory(patch.editorOperationHistory ?? current.editorOperationHistory, application) };
}
