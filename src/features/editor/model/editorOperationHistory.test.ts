import { Text } from '@codemirror/state';
import { beforeAll, describe, expect, it } from 'vitest';

import { preloadTranslationCatalog, translate } from '../../../shared/localization/translations';

import {
  createEmptyEditorOperationHistory,
  getEditorOperationRedoTitle,
  getEditorOperationSession,
  getEditorOperationUndoTitle,
  invalidateEditorOperationSession,
  moveEditorOperationEntry,
  pushEditorOperationEntry
} from './editorOperationHistory';
import { createAnnotationHistoryEntry, createTextHistoryEntry } from './editorOperationHistory.testSupport';

const t = translate.bind(null, 'en');

beforeAll(async () => preloadTranslationCatalog('en'));

describe('editorOperationHistory topic sessions', () => {
  it('keeps mixed operations ordered inside each topic without cross-topic consumption', () => {
    const text = createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', nodeId: 'node-a' });
    const annotation = createAnnotationHistoryEntry('node-a', 'annotation.create');
    const other = createTextHistoryEntry({ beforeContent: 'X', afterContent: 'XY', nodeId: 'node-b' });
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), text);
    history = pushEditorOperationEntry(history, annotation);
    history = pushEditorOperationEntry(history, other);

    history = moveEditorOperationEntry(history, 'node-a', 'undo');
    expect(getEditorOperationSession(history, 'node-a')).toMatchObject({
      redoStack: [annotation],
      undoStack: [text]
    });
    expect(getEditorOperationSession(history, 'node-b').undoStack).toEqual([other]);
  });

  it('clears redo only for the topic receiving a new operation', () => {
    const firstA = createAnnotationHistoryEntry('node-a', 'annotation.create');
    const firstB = createAnnotationHistoryEntry('node-b', 'annotation.create');
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), firstA);
    history = pushEditorOperationEntry(history, firstB);
    history = moveEditorOperationEntry(history, 'node-a', 'undo');
    history = moveEditorOperationEntry(history, 'node-b', 'undo');
    history = pushEditorOperationEntry(history, createTextHistoryEntry({
      afterContent: 'AB',
      beforeContent: 'A',
      nodeId: 'node-a'
    }));

    expect(getEditorOperationSession(history, 'node-a').redoStack).toEqual([]);
    expect(getEditorOperationSession(history, 'node-b').redoStack).toEqual([firstB]);
  });

  it('bounds entries and evicts the least-recent topic sessions', () => {
    let history = createEmptyEditorOperationHistory();
    for (let index = 0; index < 4; index += 1) {
      history = pushEditorOperationEntry(history, createTextHistoryEntry({
        afterContent: `${index + 1}`,
        beforeContent: `${index}`,
        nodeId: 'bounded',
        timestamp: index,
        userEvent: 'input.paste'
      }), 3);
    }
    for (let index = 0; index < 13; index += 1) {
      history = pushEditorOperationEntry(history, createAnnotationHistoryEntry(`topic-${index}`, 'annotation.create'));
    }

    expect(getEditorOperationSession(history, 'bounded').undoStack).toEqual([]);
    expect(history.recentNodeIds).toHaveLength(12);
    expect(history.sessionsByNodeId['topic-0']).toBeUndefined();
  });
});

describe('editorOperationHistory text grouping', () => {
  it('groups adjacent typing within 500ms into one exact ChangeSet', () => {
    const first = createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', timestamp: 1000 });
    const second = createTextHistoryEntry({ beforeContent: 'AB', afterContent: 'ABC', timestamp: 1300 });
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), first);
    history = pushEditorOperationEntry(history, second);
    const grouped = getEditorOperationSession(history, 'node-1').undoStack[0];

    expect(getEditorOperationSession(history, 'node-1').undoStack).toHaveLength(1);
    expect(grouped?.type).toBe('text.edit');
    if (grouped?.type === 'text.edit') {
      expect(grouped.forwardChanges.apply(Text.of(['A'])).toString()).toBe('ABC');
      expect(grouped.inverseChanges.apply(Text.of(['ABC'])).toString()).toBe('A');
    }
  });

  it.each([
    ['paste', createTextHistoryEntry({ beforeContent: 'AB', afterContent: 'AB pasted', timestamp: 1200, userEvent: 'input.paste' })],
    ['cut', createTextHistoryEntry({ beforeContent: 'AB', afterContent: 'A', timestamp: 1200, userEvent: 'delete.cut' })],
    ['selection replacement', createTextHistoryEntry({
      beforeContent: 'AB',
      afterContent: 'Z',
      selection: { mainIndex: 0, ranges: [{ anchor: 0, head: 2 }] },
      timestamp: 1200
    })]
  ])('keeps %s as an isolated operation', (_label, second) => {
    let history = pushEditorOperationEntry(
      createEmptyEditorOperationHistory(),
      createTextHistoryEntry({ beforeContent: 'A', afterContent: 'AB', timestamp: 1000 })
    );
    history = pushEditorOperationEntry(history, second);
    expect(getEditorOperationSession(history, 'node-1').undoStack).toHaveLength(2);
  });

  it('groups continuous composition transactions', () => {
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), createTextHistoryEntry({
      afterContent: '你', beforeContent: '', timestamp: 1000, userEvent: 'input.type.compose'
    }));
    history = pushEditorOperationEntry(history, createTextHistoryEntry({
      afterContent: '你好', beforeContent: '你', timestamp: 1800, userEvent: 'input.type.compose'
    }));
    expect(getEditorOperationSession(history, 'node-1').undoStack).toHaveLength(1);
  });

  it('groups adjacent backward deletes within the same delay window', () => {
    let history = pushEditorOperationEntry(createEmptyEditorOperationHistory(), createTextHistoryEntry({
      afterContent: 'AB', beforeContent: 'ABC', timestamp: 1000, userEvent: 'delete.backward'
    }));
    history = pushEditorOperationEntry(history, createTextHistoryEntry({
      afterContent: 'A', beforeContent: 'AB', timestamp: 1200, userEvent: 'delete.backward'
    }));
    expect(getEditorOperationSession(history, 'node-1').undoStack).toHaveLength(1);
  });
});

describe('editorOperationHistory metadata', () => {
  it('uses the requested topic for localized titles', () => {
    let history = pushEditorOperationEntry(
      createEmptyEditorOperationHistory(),
      createAnnotationHistoryEntry('node-1', 'annotation.delete')
    );
    expect(getEditorOperationUndoTitle(history, 'node-1', t)).toBe('Undo Delete Annotation');
    history = moveEditorOperationEntry(history, 'node-1', 'undo');
    expect(getEditorOperationUndoTitle(history, 'node-1', t)).toBe('Undo');
    expect(getEditorOperationRedoTitle(history, 'node-1', t)).toBe('Redo Delete Annotation');
  });

  it('records a reason and clears only the invalidated topic', () => {
    let history = pushEditorOperationEntry(
      createEmptyEditorOperationHistory(),
      createAnnotationHistoryEntry('node-1', 'annotation.create')
    );
    history = invalidateEditorOperationSession(history, { nodeId: 'node-1', reason: 'content-mismatch' });
    expect(getEditorOperationSession(history, 'node-1').undoStack).toEqual([]);
    expect(history.invalidations).toEqual([{ nodeId: 'node-1', reason: 'content-mismatch' }]);
  });
});
