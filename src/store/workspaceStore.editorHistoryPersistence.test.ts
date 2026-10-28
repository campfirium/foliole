import { ChangeSet } from '@codemirror/state';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../lib/platform/nativeContract';
import { createEmptyEditorOperationHistory } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { serializeEditorOperationHistory } from '../features/editor/model/editorOperationHistoryPersistence';
import { flushEditorOperationHistorySave } from '../shared/platform/runtime/editorOperationHistoryRuntimeRepository';

import { useWorkspaceStore } from './workspaceStore';

afterEach(async () => {
  await flushEditorOperationHistorySave();
  delete window.electronAPI;
  vi.restoreAllMocks();
});

function createHistory(sessionCount: number) {
  const history = createEmptyEditorOperationHistory();
  for (let index = 0; index < sessionCount; index += 1) {
    const nodeId = `topic-${index}`;
    history.recentNodeIds.push(nodeId);
    history.sessionsByNodeId[nodeId] = {
      redoStack: [],
      undoStack: Array.from({ length: 100 }, () => createTextHistoryEntry({
        afterContent: 'AB', beforeContent: 'A', nodeId
      }))
    };
  }
  return history;
}

it.each([1, 6, 12])('converts only history snapshots actually written with %i retained sessions', async (size) => {
  delete window.electronAPI;
  await flushEditorOperationHistorySave();
  const history = createHistory(size);
  useWorkspaceStore.setState({ editorOperationHistory: history });
  await flushEditorOperationHistorySave();
  const writes: string[] = [];
  const blocked = Promise.withResolvers<void>();
  window.electronAPI = {
    invoke: (async (command: string, args?: { payloadJson?: string }) => {
      if (command !== 'save_editor_operation_history') return null;
      writes.push(args!.payloadJson!);
      if (writes.length === 1) await blocked.promise;
      return null;
    }) as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
  const conversions = vi.spyOn(ChangeSet.prototype, 'toJSON');
  try {
    useWorkspaceStore.setState({ editorOperationHistory: { ...history } });
    for (let index = 1; index <= 3; index += 1) {
      useWorkspaceStore.setState({ editorOperationHistory: {
        ...history, invalidations: [{ nodeId: `discarded-${index}`, reason: `reason-${index}` }]
      } });
    }
    expect(writes).toHaveLength(1);
    expect(conversions).toHaveBeenCalledTimes(size * 200);
  } finally {
    blocked.resolve();
    await flushEditorOperationHistorySave();
  }
  expect(conversions).toHaveBeenCalledTimes(size * 400);
  conversions.mockRestore();
  expect(writes).toHaveLength(2);
  expect(writes.at(-1)).toBe(serializeEditorOperationHistory(useWorkspaceStore.getState().editorOperationHistory));
});
