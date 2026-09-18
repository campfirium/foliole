import { describe, expect, it } from 'vitest';

import {
  createEmptyEditorOperationHistory,
  getEditorOperationSession,
  pushEditorOperationEntry
} from './editorOperationHistory';
import {
  createAnnotationHistoryEntry,
  createTextHistoryEntry
} from './editorOperationHistory.testSupport';
import {
  deserializeEditorOperationHistory,
  serializeEditorOperationHistory
} from './editorOperationHistoryPersistence';

describe('editor operation history persistence', () => {
  it('roundtrips compact text changes and confirmed annotations', () => {
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), createTextHistoryEntry({
      afterContent: 'AB', beforeContent: 'A', nodeId: 'node-1'
    }));
    history = pushEditorOperationEntry(history, createAnnotationHistoryEntry('node-1', 'annotation.create'));

    const restored = deserializeEditorOperationHistory(serializeEditorOperationHistory(history));
    const session = getEditorOperationSession(restored, 'node-1');

    expect(session.undoStack.map((entry) => entry.type)).toEqual(['text.edit', 'annotation.create']);
    const text = session.undoStack[0];
    expect(text?.type).toBe('text.edit');
    if (text?.type === 'text.edit') {
      expect(typeof text.forwardChanges.apply).toBe('function');
      expect(serializeEditorOperationHistory(history)).not.toContain('"beforeContent"');
    }
  });

  it('excludes pending annotation mutations from durable history', () => {
    const history = pushEditorOperationEntry(
      createEmptyEditorOperationHistory(),
      createAnnotationHistoryEntry('node-1', 'annotation.create', 'pending')
    );
    const restored = deserializeEditorOperationHistory(serializeEditorOperationHistory(history));
    expect(getEditorOperationSession(restored, 'node-1').undoStack).toEqual([]);
  });

  it('fails closed to empty history for corrupt or unsupported payloads', () => {
    expect(deserializeEditorOperationHistory('{broken')).toEqual(createEmptyEditorOperationHistory());
    expect(deserializeEditorOperationHistory(JSON.stringify({ version: 999, history: {} })))
      .toEqual(createEmptyEditorOperationHistory());
  });
});
