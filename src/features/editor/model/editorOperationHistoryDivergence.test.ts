import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { applyCodeMirrorTextHistory, collectCodeMirrorTextHistoryEntries } from '../adapters/codeMirrorTextHistory';

import {
  createEmptyEditorOperationHistory,
  getEditorOperationSession,
  getEditorOperationTopEntry,
  moveEditorOperationEntry,
  pushEditorOperationEntry,
  type EditorOperationHistoryState
} from './editorOperationHistory';
import { createAnnotationHistoryEntry, createTextHistoryEntry } from './editorOperationHistory.testSupport';
import { deserializeEditorOperationHistory, serializeEditorOperationHistory } from './editorOperationHistoryPersistence';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function createEditor() {
  let history = createEmptyEditorOperationHistory();
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: 'A',
      extensions: [EditorView.updateListener.of((update) => {
        for (const entry of collectCodeMirrorTextHistoryEntries(update, 'node-1')) {
          history = pushEditorOperationEntry(history, entry);
        }
      })]
    })
  });
  return {
    getHistory: () => history,
    setHistory: (next: EditorOperationHistoryState) => { history = next; },
    view
  };
}

function replayTop(editor: ReturnType<typeof createEditor>, mode: 'redo' | 'undo') {
  const entry = getEditorOperationTopEntry(editor.getHistory(), 'node-1', mode);
  if (entry?.type !== 'text.edit') return false;
  const replay = mode === 'undo'
    ? { changes: entry.inverseChanges, expectedDigest: entry.afterDigest,
        expectedNextDigest: entry.beforeDigest, selection: entry.beforeSelection }
    : { changes: entry.forwardChanges, expectedDigest: entry.beforeDigest,
        expectedNextDigest: entry.afterDigest, selection: entry.afterSelection };
  const applied = applyCodeMirrorTextHistory({ ...replay, userEvent: mode, view: editor.view });
  if (applied) editor.setHistory(moveEditorOperationEntry(editor.getHistory(), 'node-1', mode));
  return applied;
}

describe('editor history after external content replacement', () => {
  it('keeps a temporarily mismatched entry recoverable without changing the document', () => {
    const editor = createEditor();
    editor.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    editor.view.dispatch({ changes: { from: 0, to: 2, insert: 'AX' } });

    expect(replayTop(editor, 'undo')).toBe(false);
    expect(editor.view.state.doc.toString()).toBe('AX');
    expect(getEditorOperationSession(editor.getHistory(), 'node-1').undoStack).toHaveLength(1);

    editor.view.dispatch({ changes: { from: 0, to: 2, insert: 'AB' } });
    expect(replayTop(editor, 'undo')).toBe(true);
    expect(editor.view.state.doc.toString()).toBe('A');

    editor.view.dispatch({ changes: { from: 0, to: 1, insert: 'AX' } });
    expect(replayTop(editor, 'redo')).toBe(false);
    expect(editor.view.state.doc.toString()).toBe('AX');
    editor.view.dispatch({ changes: { from: 0, to: 2, insert: 'A' } });
    expect(replayTop(editor, 'redo')).toBe(true);
    expect(editor.view.state.doc.toString()).toBe('AB');
  });

  it('abandons disconnected text after a genuine edit and survives history reload', () => {
    const editor = createEditor();
    editor.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    const oldEntry = getEditorOperationTopEntry(editor.getHistory(), 'node-1', 'undo');
    editor.setHistory(pushEditorOperationEntry(editor.getHistory(), createAnnotationHistoryEntry('node-1', 'annotation.create')));
    const other = createTextHistoryEntry({ beforeContent: 'Q', afterContent: 'QR', nodeId: 'node-2' });
    editor.setHistory(pushEditorOperationEntry(editor.getHistory(), other));

    editor.view.dispatch({ changes: { from: 0, to: 2, insert: 'AX' } });
    editor.view.dispatch({ changes: { from: 2, insert: 'Y' }, userEvent: 'input.type' });

    const current = getEditorOperationSession(editor.getHistory(), 'node-1');
    expect(current.undoStack.filter((entry) => entry.type === 'text.edit')).toHaveLength(1);
    expect(current.undoStack).toContainEqual(expect.objectContaining({ type: 'annotation.create' }));
    expect(current.undoStack).not.toContain(oldEntry);
    expect(getEditorOperationSession(editor.getHistory(), 'node-2').undoStack).toEqual([other]);

    editor.setHistory(deserializeEditorOperationHistory(serializeEditorOperationHistory(editor.getHistory())));
    expect(replayTop(editor, 'undo')).toBe(true);
    expect(editor.view.state.doc.toString()).toBe('AX');
    expect(replayTop(editor, 'redo')).toBe(true);
    expect(editor.view.state.doc.toString()).toBe('AXY');
  });

  it('retains a continuous text prefix when the external document returns to its checkpoint', () => {
    const first = createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', timestamp: 1000 });
    const abandoned = createTextHistoryEntry({ beforeContent: 'AB', afterContent: 'ABC', timestamp: 2000 });
    const replacement = createTextHistoryEntry({ beforeContent: 'AB', afterContent: 'ABX', timestamp: 3000 });
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), first);
    history = pushEditorOperationEntry(history, abandoned);
    history = pushEditorOperationEntry(history, replacement);

    expect(getEditorOperationSession(history, 'node-1').undoStack).toEqual([first, replacement]);
  });

  it('does not group adjacent-looking edits across different document bases', () => {
    const first = createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', timestamp: 1000 });
    const forked = createTextHistoryEntry({ beforeContent: 'AX', afterContent: 'AXB', timestamp: 1200 });
    const history = pushEditorOperationEntry(
      pushEditorOperationEntry(createEmptyEditorOperationHistory(), first), forked
    );

    expect(getEditorOperationSession(history, 'node-1').undoStack).toEqual([forked]);
  });
});
