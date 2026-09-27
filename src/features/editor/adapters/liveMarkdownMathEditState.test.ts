import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';
import { editedMathRangeField, getEditedMathRange, setEditedMathRangeEffect } from './liveMarkdownMathEditState';

function createState(length = 195) {
  return EditorState.create({ doc: 'x'.repeat(length), extensions: [editedMathRangeField] });
}

describe('edited math range state', () => {
  it('discards a range from a longer document before another edit', () => {
    let state = createState();
    state = state.update({ effects: setEditedMathRangeEffect.of({ from: 3390, to: 3410 }) }).state;

    expect(() => state.update({ changes: { from: 0, insert: 'a' } }).state).not.toThrow();
    expect(getEditedMathRange(state)).toBeNull();
  });

  it('keeps the in-document part of a partially stale range', () => {
    let state = createState();
    state = state.update({ effects: setEditedMathRangeEffect.of({ from: 190, to: 220 }) }).state;

    expect(getEditedMathRange(state)).toEqual({ from: 190, to: 195 });
  });

  it.each([
    { from: 20, to: 20 },
    { from: 30, to: 20 },
    { from: Number.NaN, to: 30 },
    { from: 196, to: 220 }
  ])('rejects an invalid range before storing it: $from..$to', (range) => {
    const state = createState().update({ effects: setEditedMathRangeEffect.of(range) }).state;
    expect(getEditedMathRange(state)).toBeNull();
  });

  it('maps a valid range through a document edit', () => {
    let state = createState();
    state = state.update({ effects: setEditedMathRangeEffect.of({ from: 20, to: 30 }) }).state;
    state = state.update({ changes: { from: 0, insert: 'abc' } }).state;

    expect(getEditedMathRange(state)).toEqual({ from: 23, to: 33 });
  });

  it('ignores a math widget callback after its document is replaced', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const adapter = new CodeMirrorEditorAdapter(host, { initialContent: `${'x'.repeat(3390)}$a$` });
    const view = (adapter as unknown as { view: EditorView }).view;
    const oldButton = host.querySelector<HTMLButtonElement>('.cm-md-math-source-button');
    expect(oldButton).not.toBeNull();

    adapter.setContent('x'.repeat(195));
    oldButton!.click();

    expect(view.state.doc.length).toBe(195);
    expect(getEditedMathRange(view.state)).toBeNull();
    adapter.destroy();
    host.remove();
  });
});
