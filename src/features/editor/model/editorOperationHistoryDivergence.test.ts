import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { nativeHistoryTestView } from '../adapters/nativeTextHistory.testSupport';

import {
  createEmptyEditorOperationHistory,
  getEditorOperationSession,
  getEditorOperationTopEntry,
  pushEditorOperationEntry,
} from './editorOperationHistory';
import { createAnnotationHistoryEntry, createTextHistoryEntry } from './editorOperationHistory.testSupport';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function createEditor() {
  const editor = nativeHistoryTestView('A');
  view = editor.view;
  return editor;
}
function replayTop(editor: ReturnType<typeof createEditor>, mode: 'redo' | 'undo') { return editor.replay(mode); }

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

  it('abandons disconnected text after a genuine edit while preserving annotations and other targets', () => {
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
    expect(getEditorOperationSession(editor.getHistory(), 'node-2').undoStack).toEqual([expect.objectContaining({ type: 'text.edit', nodeId: other.nodeId })]);

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

    expect(getEditorOperationSession(history, 'node-1').undoStack).toHaveLength(2);
    let top = getEditorOperationTopEntry(history, 'node-1', 'undo');
    expect(top?.type === 'text.edit' && top.nativeState?.doc.toString()).toBe('ABX');
  });

  it('does not group adjacent-looking edits across different document bases', () => {
    const first = createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', timestamp: 1000 });
    const forked = createTextHistoryEntry({ beforeContent: 'AX', afterContent: 'AXB', timestamp: 1200 });
    const history = pushEditorOperationEntry(
      pushEditorOperationEntry(createEmptyEditorOperationHistory(), first), forked
    );

    expect(getEditorOperationSession(history, 'node-1').undoStack).toHaveLength(1);
    const top = getEditorOperationTopEntry(history, 'node-1', 'undo');
    expect(top?.type === 'text.edit' && top.nativeState?.doc.toString()).toBe('AXB');
  });
});
