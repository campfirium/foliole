import { Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { CodeMirrorEditorAdapter } from '../features/editor/adapters/CodeMirrorEditorAdapter';
import { getEditorOperationSession } from '../features/editor/model/editorOperationHistory';
import { readCompanionContentSource } from '../shared/platform/companion/editing/companionContentEditing';
import { applyCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryReplay';
import { loadCompanionEditHistory } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { CompanionDraftProvider } from './CompanionDraftProvider';
import { createCompanionTopicContentSaveHandler } from './companionTopicEditingController';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const adapters: CodeMirrorEditorAdapter[] = [];
const now = '2026-10-28T08:00:00Z';
beforeEach(async () => {
  library = await createSearchLibrary(0);
  const record = await toWorkspaceNativeNodeVersion({ id: 'topic', content: 'Body', reveal: 'Answer', kind: 'item', title: 'Item',
    isTitleManual: true, hideTitleHeading: false, parentNodeId: null, anchorLink: null,
    reading: null, review: null, createdAt: now, updatedAt: now }, 'remote', 'base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
});
afterEach(async () => { adapters.splice(0).forEach(adapter => adapter.destroy()); await library.close(); });

it('preserves actual body-answer-body input order before either buffer saves, including equal timestamps', async () => {
  const save = createCompanionTopicContentSaveHandler({ state: await loadCompanionWorkspaceSyncState(),
    refreshAfterMutation: async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  const hook = renderHook(() => useCompanionTopicEditAutosave({ canEdit: true, initialContent: 'Body',
    initialVersionId: 'base', nodeId: 'topic', onSaveContent: save }), { wrapper: CompanionDraftProvider });
  await vi.waitFor(() => expect(hook.result.current.ready).toBe(true));
  const create = (field: 'content' | 'reveal', content: string) => {
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content,
      nodeId: field === 'content' ? 'topic' : 'topic::answer',
      onChange: (text, meta) => field === 'content' ? hook.result.current.handleChange(text, meta) : hook.result.current.handleRevealChange(text, meta),
      onDocumentInput: meta => field === 'content' ? hook.result.current.markBufferedInput(meta) : hook.result.current.markRevealBufferedInput(meta) });
    adapter.bindTextHistorySource(nodeId => hook.result.current.historySource?.(nodeId, field) ?? null);
    adapters.push(adapter);
    return adapter;
  };
  const body = create('content', 'Body');
  const answer = create('reveal', 'Answer');
  const type = (adapter: CodeMirrorEditorAdapter, text: string) => {
    const view = (adapter as unknown as { view: EditorView }).view;
    view.dispatch({ changes: { from: view.state.doc.length, insert: text }, selection: { anchor: view.state.doc.length + text.length },
      userEvent: 'input.type', annotations: Transaction.time.of(1000) });
  };
  act(() => { type(body, ' 1'); type(answer, ' 2'); type(body, ' 3'); });
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'Body', reveal: 'Answer' });
  await act(async () => { body.flushContentChanges(); answer.flushContentChanges(); await hook.result.current.flushPendingSave(); });
  const history = await loadCompanionEditHistory();
  expect(getEditorOperationSession(history, 'topic').undoStack.map(entry => entry.type === 'text.edit' && entry.target?.field))
    .toEqual(['content', 'reveal', 'content']);
  const expected = [
    ['undo', 'Body 1', 'Answer 2'], ['undo', 'Body 1', 'Answer'], ['undo', 'Body', 'Answer'],
    ['redo', 'Body 1', 'Answer'], ['redo', 'Body 1', 'Answer 2'], ['redo', 'Body 1 3', 'Answer 2']
  ] as const;
  for (const [mode, content, reveal] of expected) {
    await act(async () => {
      const result = await applyCompanionEditHistory('topic', mode);
      if (!result) throw new Error('Missing history replay');
      await hook.result.current.refreshAfterHistory(result.nodeId, result.versionId);
    });
    body.setContent(hook.result.current.value);
    answer.setContent(hook.result.current.reveal ?? '');
    expect(await readCompanionContentSource('topic')).toMatchObject({ content, reveal });
    expect(body.getContent()).toBe(content);
    expect(answer.getContent()).toBe(reveal);
  }
  hook.unmount();
});



it('keeps earlier saved undo reachable after unsaved input returns to the saved body', async () => {
  const save = createCompanionTopicContentSaveHandler({ state: await loadCompanionWorkspaceSyncState(),
    refreshAfterMutation: async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot
  } as ReturnType<typeof useCompanionWorkspaceSync>);
  const hook = renderHook(() => useCompanionTopicEditAutosave({ canEdit: true, initialContent: 'Body',
    initialVersionId: 'base', nodeId: 'topic', onSaveContent: save }), { wrapper: CompanionDraftProvider });
  await vi.waitFor(() => expect(hook.result.current.ready).toBe(true));
  const host = document.createElement('div');
  document.body.append(host);
  const body = new CodeMirrorEditorAdapter(host, { initialContent: 'Body', nodeId: 'topic',
    onChange: (text, meta) => hook.result.current.handleChange(text, meta),
    onDocumentInput: meta => hook.result.current.markBufferedInput(meta) });
  adapters.push(body);
  body.bindTextHistorySource(nodeId => hook.result.current.historySource?.(nodeId, 'content') ?? null);
  const view = (body as unknown as { view: EditorView }).view;
  const input = (from: number, to: number, insert: string) => act(() => view.dispatch({
    changes: { from, to, insert }, userEvent: 'input.paste'
  }));
  const flush = () => act(async () => { body.flushContentChanges(); await hook.result.current.flushPendingSave(); });
  input(4, 4, '1');
  await flush();
  input(5, 5, 'x');
  input(5, 6, '');
  await flush();
  expect(getEditorOperationSession(await loadCompanionEditHistory(), 'topic').undoStack).toHaveLength(1);
  input(5, 5, '2');
  await flush();
  await act(async () => { expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy(); });
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'Body1' });
  await act(async () => { expect(await applyCompanionEditHistory('topic', 'undo')).toBeTruthy(); });
  expect(await readCompanionContentSource('topic')).toMatchObject({ content: 'Body' });
  hook.unmount();
});
