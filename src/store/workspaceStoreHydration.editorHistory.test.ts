import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  load: vi.fn<() => Promise<string | null>>(),
  save: vi.fn()
}));

vi.mock('../shared/platform/runtime/editorOperationHistoryRuntimeRepository', () => ({
  loadEditorOperationHistoryFromRuntime: runtime.load,
  scheduleEditorOperationHistorySave: runtime.save
}));

import {
  createEmptyEditorOperationHistory,
  getEditorOperationSession,
  pushEditorOperationEntry
} from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { serializeEditorOperationHistory } from '../features/editor/model/editorOperationHistoryPersistence';

import { useWorkspaceStore } from './workspaceStore';
import { ensureWorkspaceHydrated } from './workspaceStoreHydration';

beforeEach(() => {
  runtime.load.mockReset();
  runtime.save.mockReset();
  useWorkspaceStore.setState({
    editorOperationHistory: createEmptyEditorOperationHistory(),
    isHydrated: false,
    workspaceHydrationError: null
  });
});

it('hydrates durable editor history before the workspace hydration promise resolves', async () => {
  const history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), createTextHistoryEntry({
    afterContent: 'AB', beforeContent: 'A', nodeId: 'node-1'
  }));
  runtime.load.mockResolvedValue(serializeEditorOperationHistory(history));

  await ensureWorkspaceHydrated();

  expect(getEditorOperationSession(useWorkspaceStore.getState().editorOperationHistory, 'node-1').undoStack)
    .toHaveLength(1);
  expect(runtime.load).toHaveBeenCalledOnce();
});
