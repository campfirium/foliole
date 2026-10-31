import { expect, it, vi } from 'vitest';

import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { createEditorTextReplaySave } from '../features/editor/model/editorTextReplaySave';
import { runNativeTextHistory } from '../features/editor/model/nativeTextHistory';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { createWorkspaceNodeActionsFixture, createWorkspaceNodeActionsSetStateHarness } from './workspaceStoreNodeActions.test-support';
import type { EditorOperationApplyContext } from './workspaceStoreTypes';

function prepare() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const actions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  actions.pushEditorOperationEntry(createTextHistoryEntry({ beforeContent: '', afterContent: 'A', timestamp: 1000 }));
  actions.pushEditorOperationEntry(createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', timestamp: 5000 }));
  return { harness, actions };
}

it('applies text immediately while a dependent undo waits for that exact save', async () => {
  const { actions } = prepare();
  let finish!: (saved: boolean) => void;
  const persistence = new Promise<boolean>(resolve => { finish = resolve; });
  let content = 'AB';
  let appliedCount = 0;
  const applyText = vi.fn<EditorOperationApplyContext['applyText']>((entry, mode) => {
    appliedCount += 1;
    const transaction = runNativeTextHistory(entry.nativeState!, mode, entry.nativeGroup)!;
    content = transaction.newDoc.toString();
    return { nativeState: transaction.state, ...(appliedCount === 1 ? { persistence } : {}) };
  });
  const context = { nodeId: 'node-1', currentContent: 'AB', getCurrentContent: () => content, applyText };
  expect(actions.undoEditorOperation(context)).toBe(true);
  expect(content).toBe('A');
  expect(actions.undoEditorOperation(context)).toBe(true);
  expect(applyText).toHaveBeenCalledTimes(1);
  finish(true);
  await vi.waitFor(() => expect(content).toBe(''));
  expect(applyText).toHaveBeenCalledTimes(2);
});

it('retains a failed replay and retries it before applying a dependent undo', async () => {
  const { actions } = prepare();
  const persist = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const save = createEditorTextReplaySave(vi.fn());
  let content = 'AB';
  let appliedCount = 0;
  const applyText = vi.fn<EditorOperationApplyContext['applyText']>((entry, mode) => {
    appliedCount += 1;
    const transaction = runNativeTextHistory(entry.nativeState!, mode, entry.nativeGroup)!;
    content = transaction.newDoc.toString();
    if (appliedCount !== 1) return { nativeState: transaction.state };
    save.submit(persist);
    return { nativeState: transaction.state, persistence: save.completion, save };
  });
  const context = { nodeId: 'node-1', currentContent: 'AB', getCurrentContent: () => content, applyText };
  actions.undoEditorOperation(context);
  await vi.waitFor(() => expect(save.status).toBe('failed'));
  expect(content).toBe('A');
  actions.undoEditorOperation(context);
  expect(applyText).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(content).toBe(''));
  expect(persist).toHaveBeenCalledTimes(2);
});
