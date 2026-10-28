import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => runtime.invoke }));


import { createEmptyEditorOperationHistory, getEditorOperationSession, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { useWorkspaceStore } from './workspaceStore';
import { ensureWorkspaceHydrated } from './workspaceStoreHydration';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';

beforeEach(() => {
  runtime.invoke.mockReset().mockResolvedValue(null);
  useWorkspaceStore.setState({ editorOperationHistory: createEmptyEditorOperationHistory(),
    isHydrated: false, workspaceHydrationError: null });
});

it('starts with empty undo and redo even when the previous run saved editing history', async () => {
  runtime.invoke.mockImplementation(async command => command === 'load_editor_operation_history'
    ? '{"version":1,"history":{"sessionsByNodeId":{"node-1":{"undoStack":[{}],"redoStack":[]}}}}' : null);
  await ensureWorkspaceHydrated();
  expect(getEditorOperationSession(useWorkspaceStore.getState().editorOperationHistory, 'node-1'))
    .toEqual({ undoStack: [], redoStack: [] });
  expect(runtime.invoke.mock.calls.some(([command]) => command === 'load_editor_operation_history')).toBe(false);
});

it('keeps current-session editing history when selecting another document', () => {
  const store = useWorkspaceStore.getState();
  store.pushEditorOperationEntry(createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', nodeId: 'a' }));
  useWorkspaceStore.setState({ activeNodeId: 'b' });
  store.pushEditorOperationEntry(createTextHistoryEntry({ beforeContent: 'B', afterContent: 'BC', nodeId: 'b' }));
  useWorkspaceStore.setState({ activeNodeId: 'a' });
  const history = useWorkspaceStore.getState().editorOperationHistory;
  expect(getEditorOperationSession(history, 'a').undoStack).toHaveLength(1);
  expect(getEditorOperationSession(history, 'b').undoStack).toHaveLength(1);
  expect(runtime.invoke.mock.calls.some(([command]) => command === 'save_editor_operation_history')).toBe(false);
});

it('preserves history on refresh and clears it on a different library snapshot', () => {
  const current = { ...useWorkspaceStore.getState(), libraryScope: 'library-a' };
  current.editorOperationHistory = pushEditorOperationEntry(current.editorOperationHistory,
    createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB' }));
  const merge = createWorkspaceStorePersistConfig(() => {}).merge!;
  expect(merge({ libraryScope: 'library-a' }, current).editorOperationHistory).toBe(current.editorOperationHistory);
  expect(merge({}, current).editorOperationHistory).toBe(current.editorOperationHistory);
  expect(merge({ libraryScope: 'library-b' }, current).editorOperationHistory).toEqual(createEmptyEditorOperationHistory());
});
