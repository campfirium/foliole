import { historyField, undoDepth } from '@codemirror/commands';
import { Compartment, EditorSelection, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';

import { captureNativeTextHistory, findNativeTextHistory, isolateNativeTextHistory, runNativeTextHistory } from './nativeTextHistory';
import { nativeTextHistoryExtensions, nativeTextHistoryGroups, nativeTextHistoryInputFilter } from './nativeTextHistoryGroups';

function create(doc = 'A') {
  return EditorState.create({ doc, extensions: [nativeTextHistoryExtensions, nativeTextHistoryInputFilter()] });
}
function append(state: EditorState, text: string, time: number, userEvent = 'input.type') {
  return state.update({ changes: { from: state.doc.length, insert: text }, selection: { anchor: state.doc.length + text.length },
    userEvent, annotations: Transaction.time.of(time) }).state;
}
function replay(state: EditorState, mode: 'undo' | 'redo') {
  const tr = runNativeTextHistory(state, mode);
  expect(tr).not.toBeNull();
  return tr!.state;
}

it('shares immutable document and opaque native history while dropping View configuration', () => {
  const source = append(append(create(), 'B', 1000), 'C', 1100);
  const snapshot = captureNativeTextHistory(source);
  expect(snapshot.doc).toBe(source.doc);
  expect(snapshot.field(historyField)).toBe(source.field(historyField));
  expect(snapshot.field(nativeTextHistoryGroups)).toBe(source.field(nativeTextHistoryGroups));
  expect(replay(snapshot, 'undo').doc.toString()).toBe('A');
  expect(replay(replay(snapshot, 'undo'), 'redo').doc.toString()).toBe('ABC');
});

it('tracks actual native grouping and preserves group identity across merged input and replay', () => {
  const first = append(create(), 'B', 1000);
  const group = first.field(nativeTextHistoryGroups).undo.at(-1)!;
  const merged = append(first, 'C', 1100);
  expect(merged.field(nativeTextHistoryGroups).undo).toEqual([group]);
  expect(runNativeTextHistory(merged, 'undo', {})).toBeNull();
  const undone = runNativeTextHistory(merged, 'undo', group)!.state;
  expect(undone.field(nativeTextHistoryGroups).redo).toEqual([group]);
  expect(replay(undone, 'redo').field(nativeTextHistoryGroups).undo).toEqual([group]);
});

it('keeps ordinary composition grouped and isolates its continuation after an application boundary', () => {
  const first = append(create(), 'B', 1000, 'input.type.compose.start');
  expect(undoDepth(append(first, 'C', 1100, 'input.type.compose'))).toBe(1);
  const boundary = isolateNativeTextHistory(first);
  const next = append(boundary, 'C', 1100, 'input.type.compose');
  expect(undoDepth(next)).toBe(2);
  expect(replay(next, 'undo').doc.toString()).toBe('AB');
  expect(replay(replay(next, 'undo'), 'undo').doc.toString()).toBe('A');
});

it('does not consume a composition boundary on excluded changes or rejected input', () => {
  let state = isolateNativeTextHistory(append(create(), 'B', 1000, 'input.type.compose.start'));
  state = state.update({ changes: { from: 0, insert: 'X' }, annotations: Transaction.addToHistory.of(false) }).state;
  expect(state.field(nativeTextHistoryGroups).boundary).toBe(true);
  state = state.update({ userEvent: 'input.type.compose' }).state;
  expect(state.field(nativeTextHistoryGroups).boundary).toBe(true);
  state = append(state, 'C', 1100, 'input.type.compose');
  expect(replay(state, 'undo').doc.toString()).toBe('XAB');
  expect(replay(replay(state, 'undo'), 'undo').doc.toString()).toBe('XA');
});

it('tracks native bulk trimming without mistaking a new event for a merged group', () => {
  let state = create();
  for (let index = 0; index < 520; index++) state = append(state, 'x', 1000 + index * 1000, 'input.paste');
  expect(undoDepth(state)).toBe(520);
  const previous = state.field(nativeTextHistoryGroups).undo;
  state = append(state, 'last', 600000, 'input.paste');
  const groups = state.field(nativeTextHistoryGroups).undo;
  expect(undoDepth(state)).toBe(502);
  expect(groups).toHaveLength(502);
  expect(groups.at(-1)).not.toBe(previous.at(-1));
  expect(groups[0]).toBe(previous[19]);
  for (let index = 0; index < 500; index++) state = replay(state, 'undo');
  for (let index = 0; index < 500; index++) state = replay(state, 'redo');
  expect(state.doc.toString()).toBe(`A${'x'.repeat(520)}last`);
});

it('finds a detached prefix without advancing the canonical branch and drops only its native redo on new input', () => {
  const first = append(create(), 'B', 1000, 'input.paste');
  const canonical = append(first, 'C', 2000, 'input.paste');
  expect(findNativeTextHistory(canonical, 'AX')).toBeNull();
  const prefix = findNativeTextHistory(canonical, 'AB')!;
  const branch = append(prefix, 'X', 3000, 'input.paste');
  expect(branch.field(nativeTextHistoryGroups).redo).toEqual([]);
  expect(replay(branch, 'undo').doc.toString()).toBe('AB');
  expect(replay(replay(branch, 'undo'), 'undo').doc.toString()).toBe('A');
  expect(canonical.doc.toString()).toBe('ABC');
  expect(replay(canonical, 'undo').doc.toString()).toBe('AB');
});

it('installs a saved native field into the current View without moving stale View configuration', () => {
  const slot = new Compartment();
  const saved = captureNativeTextHistory(append(create(), 'B', 1000));
  const view = new EditorView({ parent: document.createElement('div'), state: EditorState.create({
    doc: saved.doc, extensions: [slot.of(nativeTextHistoryExtensions), nativeTextHistoryInputFilter()]
  }) });
  try {
    view.dispatch({ effects: slot.reconfigure([]) });
    view.dispatch({ effects: slot.reconfigure([nativeTextHistoryExtensions,
      historyField.init(() => saved.field(historyField)),
      nativeTextHistoryGroups.init(() => saved.field(nativeTextHistoryGroups))]) });
    const tr = runNativeTextHistory(view.state, 'undo')!;
    view.dispatch(tr);
    expect(view.state.doc.toString()).toBe('A');
    view.dispatch(runNativeTextHistory(view.state, 'redo')!);
    expect(view.state.doc.toString()).toBe('AB');
  } finally { view.destroy(); }
});

it('preserves multiple selections through native replay and snapshot transfer', () => {
  const state = EditorState.create({ doc: 'ABCD', selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)], 1),
    extensions: [EditorState.allowMultipleSelections.of(true), nativeTextHistoryExtensions] });
  const edited = state.update({ changes: [{ from: 1, insert: 'x' }, { from: 3, insert: 'y' }], userEvent: 'input.paste' }).state;
  expect(replay(captureNativeTextHistory(edited), 'undo').selection.eq(state.selection)).toBe(true);
});
