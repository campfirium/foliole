import { ChangeSet } from '@codemirror/state';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../lib/platform/nativeContract';
import { createEmptyEditorOperationHistory, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

import { useWorkspaceStore } from './workspaceStore';

afterEach(async () => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});

function createHistory(sessionCount: number) {
  let history = createEmptyEditorOperationHistory();
  for (let index = 0; index < sessionCount; index++) {
    for (let step = 0; step < 100; step++) history = pushEditorOperationEntry(history, createTextHistoryEntry({
      afterContent: String(step + 1), beforeContent: String(step), nodeId: `topic-${index}`,
      timestamp: 1000 + step * 1000, userEvent: 'input.paste'
    }));
  }
  return history;
}

it.each([1, 6, 12])('keeps %i document histories in memory without encoding or writing them', async (size) => {
  const invoke = vi.fn(async () => null);
  window.electronAPI = {
    invoke: invoke as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
  const history = createHistory(size);
  const conversions = vi.spyOn(ChangeSet.prototype, 'toJSON');
  useWorkspaceStore.setState({ editorOperationHistory: history });
  for (let index = 1; index <= 3; index += 1) {
    useWorkspaceStore.setState({ editorOperationHistory: {
      ...history, invalidations: [{ nodeId: `changed-${index}`, reason: 'external-content-change' }]
    } });
  }
  expect(conversions).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().editorOperationHistory.recentNodeIds).toHaveLength(size);
});
