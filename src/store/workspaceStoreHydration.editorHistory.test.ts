import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../shared/platform/runtime/editorOperationHistoryRuntimeRepository', () => ({
  loadEditorOperationHistoryFromRuntime: runtime.load,
  scheduleEditorOperationHistorySave: runtime.save
}));

import { createEmptyEditorOperationHistory, getEditorOperationSession, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { serializeEditorOperationHistory } from '../features/editor/model/editorOperationHistoryPersistence';

import { useWorkspaceStore } from './workspaceStore';
import { ensureWorkspaceHydrated } from './workspaceStoreHydration';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';

beforeEach(() => {
  runtime.load.mockReset();
  runtime.save.mockReset();
  useWorkspaceStore.setState({ editorOperationHistory: createEmptyEditorOperationHistory(),
    isHydrated: false, workspaceHydrationError: null });
});

it('starts with empty undo and redo even when the previous run saved editing history', async () => {
  const history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), createTextHistoryEntry({
    afterContent: 'AB', beforeContent: 'A', nodeId: 'node-1'
  }));
  runtime.load.mockResolvedValue(serializeEditorOperationHistory(history));
  await ensureWorkspaceHydrated();
  expect(getEditorOperationSession(useWorkspaceStore.getState().editorOperationHistory, 'node-1'))
    .toEqual({ undoStack: [], redoStack: [] });
  expect(runtime.load).not.toHaveBeenCalled();
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
  expect(runtime.save).not.toHaveBeenCalled();
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
