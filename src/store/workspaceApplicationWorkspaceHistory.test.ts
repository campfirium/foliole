import { expect, it } from 'vitest';

import { pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { beginWorkspaceAction, createEmptyWorkspaceActionHistory, settleWorkspaceAction } from './workspaceActionHistoryState';
import { createApplicationHistory } from './workspaceApplicationHistory';
import { publishApplicationHistories } from './workspaceApplicationHistoryPublish';
import { projectApplicationWorkspaceHistory } from './workspaceApplicationWorkspaceHistory';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';
import { createStructureRenameEntry } from './workspaceStructureHistoryEntries';

it('admits a workspace action before completion and retains interleaved text in its actual position', () => {
  let state = createWorkspaceNodeActionsFixture();
  const application = createApplicationHistory();
  const publish = (patch: Parameters<typeof publishApplicationHistories>[0]) => {
    state = { ...state, ...publishApplicationHistories(patch, state) };
  };
  publish({ appActionHistory: projectApplicationWorkspaceHistory(createEmptyWorkspaceActionHistory(), application) });
  const entry = createStructureRenameEntry({ nodeId: 'node-1', kind: 'topic', beforeTitle: 'Old', afterTitle: 'New' });
  publish({ appActionHistory: beginWorkspaceAction(state.appActionHistory, entry) });
  publish({ editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory,
    createTextHistoryEntry({ nodeId: 'node-1', beforeContent: 'A', afterContent: 'AB' })) });
  publish({ appActionHistory: settleWorkspaceAction(state.appActionHistory, entry.id).history });
  expect(state.appActionHistory.application).toBe(state.editorOperationHistory.application);
  expect(state.appActionHistory.application!.undo.map(operation => operation.domain)).toEqual(['workspace', 'editor']);
  expect(state.appActionHistory.application!.undo.every(operation => operation.ready)).toBe(true);
  expect(state.editorOperationHistory.sessionsByNodeId['node-1']?.undoStack).toHaveLength(1);
});

it('separates two native text groups when a business action intervenes even on the same node', () => {
  let state = createWorkspaceNodeActionsFixture();
  const publish = (patch: Parameters<typeof publishApplicationHistories>[0]) => {
    state = { ...state, ...publishApplicationHistories(patch, state) };
  };
  publish({ appActionHistory: projectApplicationWorkspaceHistory(createEmptyWorkspaceActionHistory(), createApplicationHistory()) });
  publish({ editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory,
    createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB' })) });
  const entry = createStructureRenameEntry({ nodeId: 'node-1', kind: 'topic', beforeTitle: 'Old', afterTitle: 'New' });
  publish({ appActionHistory: beginWorkspaceAction(state.appActionHistory, entry) });
  publish({ appActionHistory: settleWorkspaceAction(state.appActionHistory, entry.id).history });
  publish({ editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory,
    createTextHistoryEntry({ beforeContent: 'AB', afterContent: 'ABC' })) });
  expect(state.appActionHistory.application!.undo.map(operation => operation.domain)).toEqual(['editor', 'workspace', 'editor']);
});
