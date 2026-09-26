import { EditorSelection, EditorState, findClusterBreak } from '@codemirror/state';
import { expect, it } from 'vitest';

import { preserveDevanagariConjunctPointerSelection } from './devanagariPointerSelection';

function select(text: string, anchor: number, head: number, userEvent = 'select.pointer') {
  const state = EditorState.create({
    doc: text,
    extensions: [preserveDevanagariConjunctPointerSelection]
  });
  return state.update({ selection: { anchor, head }, userEvent }).state.selection.main;
}

it('keeps a Devanagari vowel sign with its consonant during selection', () => {
  const text = 'बिजौलिया';
  const firstClusterEnd = findClusterBreak(text, 0);

  expect(text.slice(0, firstClusterEnd)).toBe('बि');
});

it('keeps a preceding newline outside the Devanagari syllable', () => {
  const text = '\nबि';

  expect(findClusterBreak(text, 0)).toBe(1);
  expect(text.slice(1, findClusterBreak(text, 1))).toBe('बि');
});

it.each([
  'ब्राह्मण ने पुस्तक पढ़ी।',
  'क्षत्रिय वंश से था।',
  'ज्ञान की प्राप्ति हुई।',
  'त्रिवेदी जी आए।'
])('keeps the complete conjunct when pointer-selecting %s', (text) => {
  const selection = select(text, 2, text.length);

  expect(selection).toMatchObject({ from: 0, to: text.length });
  expect(text.slice(selection.from, selection.to)).toBe(text);
});

it('corrects a reverse drag and a conjunct inside mixed-language text', () => {
  const text = 'Hello ब्राह्मण world';

  expect(select(text, 14, 8)).toMatchObject({ anchor: 14, head: 6, from: 6, to: 14 });
  expect(select(text, 2, 5)).toMatchObject({ from: 2, to: 5 });
});

it('leaves clicks, keyboard selections, and valid conjunct boundaries alone', () => {
  const text = 'ब्राह्मण ने पुस्तक पढ़ी।';

  expect(select(text, 2, 2)).toMatchObject({ from: 2, to: 2 });
  expect(select(text, 2, text.length, 'select.keyboard')).toMatchObject({ from: 2, to: text.length });
  expect(select(text, 4, text.length)).toMatchObject({ from: 4, to: text.length });
});

it('preserves unrelated ranges in a multiple-selection drag', () => {
  const text = 'Hello ब्राह्मण world';
  const state = EditorState.create({
    doc: text,
    extensions: [EditorState.allowMultipleSelections.of(true), preserveDevanagariConjunctPointerSelection]
  });
  const selection = EditorSelection.create([
    EditorSelection.range(0, 5),
    EditorSelection.range(8, 14)
  ], 1);
  const result = state.update({ selection, userEvent: 'select.pointer' }).state.selection;

  expect(result.ranges.map(({ from, to }) => ({ from, to }))).toEqual([
    { from: 0, to: 5 },
    { from: 6, to: 14 }
  ]);
  expect(result.mainIndex).toBe(1);
});
