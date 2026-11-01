import { describe, expect, it } from 'vitest';

import { createEmptyEditorOperationHistory, getEditorOperationTopEntry, moveEditorOperationEntry, pushEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';
import { runNativeTextHistory } from '../features/editor/model/nativeTextHistory';

import { projectApplicationEditorHistory } from './workspaceApplicationEditorHistory';
import { createApplicationHistory, reserveApplicationReplay, settleApplicationReplay, startApplicationReplay } from './workspaceApplicationHistory';

function empty() { return projectApplicationEditorHistory(createEmptyEditorOperationHistory(), createApplicationHistory()); }
function input(history: ReturnType<typeof empty>, nodeId: string, beforeContent: string, afterContent: string) {
  return pushEditorOperationEntry(history, createTextHistoryEntry({ nodeId, beforeContent, afterContent, timestamp: 1000 }));
}
function replay(history: ReturnType<typeof empty>, direction: 'undo' | 'redo') {
  const application = startApplicationReplay(reserveApplicationReplay(history.application!, direction));
  history = projectApplicationEditorHistory(history, application);
  const operation = application[direction].at(-1)!;
  if (operation.domain !== 'editor') throw new Error('Expected editor operation');
  const entry = getEditorOperationTopEntry(history, operation.entry.nodeId, direction)!;
  if (entry.type !== 'text.edit' || !entry.nativeState) throw new Error('Expected native text');
  const tr = runNativeTextHistory(entry.nativeState, direction, entry.nativeGroup)!;
  expect(tr).not.toBeNull();
  history = moveEditorOperationEntry(history, entry.nodeId, direction, tr.state);
  history = projectApplicationEditorHistory(history, settleApplicationReplay(history.application!, application.requests[0]!.id,
    { status: 'committed', operation }));
  return { history, content: tr.newDoc.toString() };
}

describe('one sequence retaining native document history', () => {
  it('undoes A, B, A input as three actual groups and redoes all three', () => {
    let history = input(input(input(empty(), 'a', 'A', 'A1'), 'b', 'B', 'B1'), 'a', 'A1', 'A12');
    expect(history.application!.undo).toHaveLength(3);
    for (const expected of ['A1', 'B', 'A']) {
      const result = replay(history, 'undo');
      history = result.history;
      expect(result.content).toBe(expected);
    }
    for (const expected of ['A1', 'B1', 'A12']) {
      const result = replay(history, 'redo');
      history = result.history;
      expect(result.content).toBe(expected);
    }
  });

  it('retains CM grouping while consecutive typing belongs to the same global step', () => {
    const history = input(input(empty(), 'a', 'A', 'A1'), 'a', 'A1', 'A12');
    expect(history.application!.undo).toHaveLength(1);
    expect(replay(history, 'undo').content).toBe('A');
  });

  it('does not lose earlier documents when a thirteenth document is edited', () => {
    let history = empty();
    for (let i = 0; i < 14; i++) history = input(history, String(i), '', String(i));
    for (let i = 13; i >= 0; i--) {
      const result = replay(history, 'undo');
      history = result.history;
      expect(result.content).toBe('');
    }
    expect(history.application!.undo).toEqual([]);
  });
});
