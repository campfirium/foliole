import { describe, expect, it, vi } from 'vitest';

import {
  applyEditorOperationHistory,
  createEmptyEditorOperationHistory,
  getEditorOperationRedoTitle,
  getEditorOperationUndoTitle,
  pushEditorOperationEntry,
  type EditorOperationHistoryEntry
} from './editorOperationHistory';

function createTextEntry(
  nodeId: string,
  beforeContent: string,
  afterContent: string
): EditorOperationHistoryEntry {
  return {
    afterContent,
    beforeContent,
    nodeId,
    title: 'Edit Text',
    type: 'text.edit'
  };
}

function createAnnotationEntry(
  nodeId: string,
  type: 'annotation.create' | 'annotation.delete'
): EditorOperationHistoryEntry {
  const annotation = {
    anchorId: 'anchor-1',
    kind: 'highlight' as const,
    nodeId: 'highlight-1',
    orderIndex: 2,
    parentNodeId: nodeId
  };
  if (type === 'annotation.create') {
    return {
      annotations: [annotation],
      nodeId,
      title: 'Create Annotation',
      type
    };
  }
  return {
    annotations: [annotation],
    nodeId,
    title: 'Delete Annotation',
    type
  };
}

describe('editorOperationHistory order', () => {
  it('undoes and redoes entries in the user action order', () => {
    let history = createEmptyEditorOperationHistory();
    const textEntry = createTextEntry('node-1', 'Before', 'After');
    const annotationEntry = createAnnotationEntry('node-1', 'annotation.create');
    const applyCalls: Array<[EditorOperationHistoryEntry['type'], 'redo' | 'undo']> = [];
    const applyEntry = (entry: EditorOperationHistoryEntry, mode: 'redo' | 'undo') => {
      applyCalls.push([entry.type, mode]);
      return true;
    };

    history = pushEditorOperationEntry(history, textEntry);
    history = pushEditorOperationEntry(history, annotationEntry);

    const undoAnnotation = applyEditorOperationHistory({
      applyEntry,
      currentNodeId: 'node-1',
      history,
      mode: 'undo'
    });
    expect(undoAnnotation.entry).toBe(annotationEntry);

    const undoText = applyEditorOperationHistory({
      applyEntry,
      currentNodeId: 'node-1',
      history: undoAnnotation.history,
      mode: 'undo'
    });
    expect(undoText.entry).toBe(textEntry);

    const redoText = applyEditorOperationHistory({
      applyEntry,
      currentNodeId: 'node-1',
      history: undoText.history,
      mode: 'redo'
    });
    expect(redoText.entry).toBe(textEntry);
    expect(applyCalls).toEqual([
      ['annotation.create', 'undo'],
      ['text.edit', 'undo'],
      ['text.edit', 'redo']
    ]);
  });

});

describe('editorOperationHistory scope guards', () => {
  it('does not consume entries for another editor node', () => {
    const entry = createTextEntry('node-2', 'Before', 'After');
    const history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), entry);
    const applyEntry = vi.fn(() => true);

    const result = applyEditorOperationHistory({
      applyEntry,
      currentNodeId: 'node-1',
      history,
      mode: 'undo'
    });

    expect(result.applied).toBe(false);
    expect(result.history).toBe(history);
    expect(applyEntry).not.toHaveBeenCalled();
  });

  it('allows annotation redo even when focus moved away from the editor node', () => {
    const entry = createAnnotationEntry('node-1', 'annotation.create');
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), entry);
    history = applyEditorOperationHistory({
      applyEntry: () => true,
      currentNodeId: 'node-1',
      history,
      mode: 'undo'
    }).history;
    const applyEntry = vi.fn(() => true);

    const result = applyEditorOperationHistory({
      applyEntry,
      currentNodeId: 'node-2',
      history,
      mode: 'redo'
    });

    expect(result.applied).toBe(true);
    expect(applyEntry).toHaveBeenCalledWith(entry, 'redo');
  });

  it('keeps a failed apply at the stack top', () => {
    const entry = createAnnotationEntry('node-1', 'annotation.delete');
    const history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), entry);

    const result = applyEditorOperationHistory({
      applyEntry: () => false,
      currentNodeId: 'node-1',
      history,
      mode: 'undo'
    });

    expect(result.applied).toBe(false);
    expect(result.history.undoStack).toEqual([entry]);
    expect(result.history.redoStack).toEqual([]);
  });

});

describe('editorOperationHistory redo', () => {
  it('clears redo only when a new user operation is pushed', () => {
    const first = createTextEntry('node-1', 'A', 'B');
    const second = createAnnotationEntry('node-1', 'annotation.create');
    const third = createTextEntry('node-1', 'B', 'C');
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), first);
    history = pushEditorOperationEntry(history, second);
    history = applyEditorOperationHistory({
      applyEntry: () => true,
      currentNodeId: 'node-1',
      history,
      mode: 'undo'
    }).history;

    expect(history.redoStack).toEqual([second]);

    history = pushEditorOperationEntry(history, third);

    expect(history.undoStack).toEqual([first, third]);
    expect(history.redoStack).toEqual([]);
  });

});

describe('editorOperationHistory metadata', () => {
  it('exposes titles for the current editor history top', () => {
    let history = pushEditorOperationEntry(
      createEmptyEditorOperationHistory(),
      createAnnotationEntry('node-1', 'annotation.delete')
    );

    expect(getEditorOperationUndoTitle(history)).toBe('Undo Delete Annotation');

    history = applyEditorOperationHistory({
      applyEntry: () => true,
      currentNodeId: 'node-1',
      history,
      mode: 'undo'
    }).history;

    expect(getEditorOperationUndoTitle(history)).toBe('Undo');
    expect(getEditorOperationRedoTitle(history)).toBe('Redo Delete Annotation');
  });

  it('trims the undo stack to the configured limit', () => {
    let history = createEmptyEditorOperationHistory();
    for (let index = 0; index < 4; index += 1) {
      history = pushEditorOperationEntry(history, createTextEntry('node-1', `${index}`, `${index + 1}`), 3);
    }

    expect(history.undoStack.map((entry) => (entry.type === 'text.edit' ? entry.beforeContent : ''))).toEqual([
      '1',
      '2',
      '3'
    ]);
  });
});
