import { beforeAll, expect, it, vi } from 'vitest';

import { createEmptyEditorOperationHistory } from '../features/editor/model/editorOperationHistory';
import { preloadTranslationCatalog, translate } from '../shared/localization/translations';

import { createHistoryCommands, getHistoryCommandState } from './historyCommands';
import {
  beginWorkspaceAction,
  beginWorkspaceStructureCreate,
  createEmptyWorkspaceActionHistory,
  createWorkspaceActionHistoryActions,
  failWorkspaceAction
} from './workspaceActionHistory';
import { captureWorkspaceHistoryContext } from './workspaceHistoryContext';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';
import { createStructureCreateEntry, createStructureRenameEntry } from './workspaceStructureHistoryEntries';
import { setUndoRouterTarget } from './workspaceUndoRouter';

const t = translate.bind(null, 'en');
beforeAll(() => preloadTranslationCatalog('en'));

function createPendingHarness(kind: 'action' | 'create') {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const context = captureWorkspaceHistoryContext(harness.getState());
  const entry = createStructureCreateEntry({
    afterActiveNodeId: 'node-1', afterContext: context, beforeActiveNodeId: null, beforeContext: context,
    kind: 'topic', nodeIds: ['node-1'], rootNodeId: 'node-1'
  });
  const previous = createStructureRenameEntry({ afterTitle: 'New', beforeTitle: 'Old', kind: 'topic', nodeId: 'other' });
  const base = { ...createEmptyWorkspaceActionHistory(), redoStack: [previous] };
  harness.setState({ appActionHistory: kind === 'action'
    ? beginWorkspaceAction(base, entry) : beginWorkspaceStructureCreate(base, entry) });
  const actions = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  const commands = createHistoryCommands({
    getEditorOperationContext: () => undefined,
    ws: { ...actions, undoEditorOperation: vi.fn(() => false), redoEditorOperation: vi.fn(() => false) }
  });
  setUndoRouterTarget('workspace', null);
  return { actions, commands, entry, harness };
}

it.each(['action', 'create'] as const)('offers pending %s undo but never an older redo, matching execution', (kind) => {
  const { actions, commands, entry, harness } = createPendingHarness(kind);
  const state = (mode: 'undo' | 'redo') => getHistoryCommandState({
    appActionHistory: harness.getState().appActionHistory,
    editorOperationHistory: createEmptyEditorOperationHistory(), mode, target: { owner: 'workspace' }, t
  });
  expect(state('undo')).toEqual({ enabled: true, title: 'Undo Create Topic' });
  expect(state('redo').enabled).toBe(false);
  expect(commands.redo()).toBe(false);
  expect(actions.undoWorkspaceAction('older-notice')).toBe(false);
  expect(commands.undo()).toBe(true);
  const history = harness.getState().appActionHistory;
  expect(history.pendingAction ?? history.pendingCreate).toMatchObject({ entry: { id: entry.id }, undoRequested: true });
  expect(history.applying).toBeNull();
});

it('removes failed pending undo from both the command state and execution', () => {
  const { commands, entry, harness } = createPendingHarness('action');
  expect(commands.undo()).toBe(true);
  harness.setState((state) => ({ appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id) }));
  const command = getHistoryCommandState({
    appActionHistory: harness.getState().appActionHistory,
    editorOperationHistory: createEmptyEditorOperationHistory(), mode: 'undo', target: { owner: 'workspace' }, t
  });
  expect(command).toEqual({ enabled: false, title: 'Undo' });
  expect(commands.undo()).toBe(false);
  expect(harness.getState().appActionHistory.undoStack).toEqual([]);
});

it.each(['undo', 'redo'] as const)('disables %s while a workspace history operation is being applied', (mode) => {
  const { commands, entry, harness } = createPendingHarness('action');
  harness.setState((state) => ({ appActionHistory: {
    ...state.appActionHistory, applying: { entryId: entry.id, mode: 'undo' }
  } }));
  expect(getHistoryCommandState({
    appActionHistory: harness.getState().appActionHistory,
    editorOperationHistory: createEmptyEditorOperationHistory(), mode, target: { owner: 'workspace' }, t
  }).enabled).toBe(false);
  expect(commands[mode]()).toBe(false);
});
