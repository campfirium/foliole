import { EditorView } from '@codemirror/view';
import { afterEach, expect, it, vi } from 'vitest';

import { getEditorTextHistorySource } from '../model/editorNativeOperationHistory';
import { createEmptyEditorOperationHistory, getEditorOperationTopEntry, moveEditorOperationEntry, pushEditorOperationEntry } from '../model/editorOperationHistory';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

const adapters: CodeMirrorEditorAdapter[] = [];
function editor(content = 'A') {
  let history = createEmptyEditorOperationHistory();
  let nodeId = 'a';
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = new CodeMirrorEditorAdapter(host, { initialContent: content, nodeId, onChange: () => {},
    onDocumentInput: meta => {
      for (const input of meta.textTransactions ?? []) history = pushEditorOperationEntry(history, input);
    } });
  adapters.push(adapter);
  adapter.bindTextHistorySource?.(id => getEditorTextHistorySource(history, id));
  const view = (adapter as unknown as { view: EditorView }).view;
  return { adapter, view,
    type: (text: string) => view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' }),
    setDocument(id: string, value: string) { nodeId = id; adapter.setNodeId(id); adapter.setContent(value); },
    replay(mode: 'redo' | 'undo') {
      const entry = getEditorOperationTopEntry(history, nodeId, mode);
      if (entry?.type !== 'text.edit') return false;
      const result = adapter.applyTextHistory(entry, mode);
      if (!result) return false;
      history = moveEditorOperationEntry(history, nodeId, mode, result.nativeState);
      return true;
    }
  };
}
afterEach(() => { adapters.splice(0).forEach(adapter => adapter.destroy()); vi.restoreAllMocks(); document.body.replaceChildren(); });

it.each([25_000, 250_000, 1_000_000])('does not encode the %i-character document for input history or native undo/redo', size => {
  const content = '中😀text\n'.repeat(Math.ceil(size / 8)).slice(0, size);
  const runtime = editor(content);
  const encode = vi.spyOn(TextEncoder.prototype, 'encode');
  for (const text of ['a', 'b', 'c', 'd']) runtime.type(text);
  expect(encode).not.toHaveBeenCalled();
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe(content);
  expect(runtime.replay('redo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe(content + 'abcd');
  expect(encode).not.toHaveBeenCalled();
});

it('preserves independent native undo/redo while one adapter switches documents', () => {
  const runtime = editor();
  runtime.type('B');
  runtime.setDocument('b', 'X');
  runtime.type('Y');
  runtime.setDocument('a', 'AB');
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('A');
  expect(runtime.replay('redo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('AB');
  runtime.setDocument('b', 'XY');
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('X');
});

it('allows application-owned history replay after the editor becomes read-only', () => {
  const runtime = editor();
  runtime.type('B');
  runtime.adapter.setReadOnly(true);
  expect(runtime.view.state.readOnly).toBe(true);
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('A');
  expect(runtime.view.state.readOnly).toBe(true);
  expect(runtime.replay('redo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('AB');
});

it('consumes native beforeinput history requests even when the application has no undo route', () => {
  const runtime = editor();
  runtime.type('B');
  const event = new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true });
  runtime.view.contentDOM.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(runtime.adapter.getContent()).toBe('AB');
  expect(runtime.replay('undo')).toBe(true);
});

it('does not join a composition continuation to hidden native history after the 500 visible steps are undone', () => {
  const runtime = editor();
  for (let index = 0; index < 521; index++) runtime.view.dispatch({
    changes: { from: runtime.view.state.doc.length, insert: 'x' }, userEvent: 'input.paste'
  });
  for (let index = 0; index < 500; index++) expect(runtime.replay('undo')).toBe(true);
  expect(runtime.replay('undo')).toBe(false);
  const checkpoint = runtime.adapter.getContent();
  expect(checkpoint).toBe('A' + 'x'.repeat(21));
  runtime.view.dispatch({ changes: { from: checkpoint.length, insert: 'new' }, userEvent: 'input.type.compose' });
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe(checkpoint);
  expect(runtime.replay('undo')).toBe(false);
});


it('starts a separate composition group after reconnecting an external prefix', () => {
  const runtime = editor();
  runtime.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.paste' });
  runtime.view.dispatch({ changes: { from: 2, insert: 'C' }, userEvent: 'input.paste' });
  runtime.adapter.setContent('AB');
  runtime.view.dispatch({ changes: { from: 2, insert: 'X' }, userEvent: 'input.type.compose' });
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('AB');
  expect(runtime.replay('undo')).toBe(true);
  expect(runtime.adapter.getContent()).toBe('A');
});
