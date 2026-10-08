import { EditorState } from '@codemirror/state';
import { expect, it } from 'vitest';

import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../../../../lib/core/nodes/textBodyBudget';

import { changedBodyBytes, createBodyBudgetExtension } from './codeMirrorBodyBudget';

it('counts replacement and multiple edits correctly at Unicode boundaries', () => {
  const state = EditorState.create({ doc: 'ab😀中cd😀ef' });
  for (const changes of [
    [{ from: 2, to: 4, insert: '文' }],
    [{ from: 3, to: 3, insert: 'x' }],
    [{ from: 0, to: 1, insert: '😀' }, { from: 5, to: 6, insert: '中' }],
    [{ from: 2, to: 3, insert: 'x' }, { from: 4, to: 4, insert: '😀' }]
  ]) {
    const transaction = state.update({ changes });
    expect(changedBodyBytes(utf8ByteLength(state.doc.toString()), transaction))
      .toBe(utf8ByteLength(transaction.newDoc.toString()));
  }
});

it('allows the exact limit, rejects overflowing paste atomically and retains its complete candidate', () => {
  let candidate = '';
  const state = EditorState.create({
    doc: 'x'.repeat(TEXT_BODY_MAX_BYTES - 1),
    extensions: createBodyBudgetExtension((transaction) => { candidate = transaction.newDoc.toString(); })
  });
  const exact = state.update({ changes: { from: state.doc.length, insert: 'y' }, userEvent: 'input' }).state;
  expect(exact.doc.length).toBe(TEXT_BODY_MAX_BYTES);
  const overflowing = exact.update({ changes: { from: 0, to: 1, insert: '中文😀' }, userEvent: 'input.paste' });
  expect(overflowing.state.doc.toString()).toBe(exact.doc.toString());
  expect(candidate).toBe('中文😀' + exact.doc.sliceString(1));
});

it('allows deletions in a legacy oversized body so the user can reduce it', () => {
  const state = EditorState.create({ doc: 'x'.repeat(TEXT_BODY_MAX_BYTES + 2), extensions: createBodyBudgetExtension(() => {}) });
  expect(state.update({ changes: { from: 0, to: 1 }, userEvent: 'delete' }).state.doc.length).toBe(TEXT_BODY_MAX_BYTES + 1);
});

it('rejects unlabelled edits and pastes into an empty document without losing the candidate', () => {
  let candidate = '';
  const state = EditorState.create({ extensions: createBodyBudgetExtension((transaction) => { candidate = transaction.newDoc.toString(); }) });
  const content = '😀'.repeat(300_000);
  expect(state.update({ changes: { from: 0, insert: content } }).state.doc.toString()).toBe('');
  expect(candidate).toBe(content);
});

it('allows external loads while enforcing the next user edit', () => {
  let enabled = false;
  let called = false;
  let state = EditorState.create({ extensions: createBodyBudgetExtension(() => { called = true; }, () => enabled) });
  state = state.update({ changes: { from: 0, insert: 'x'.repeat(TEXT_BODY_MAX_BYTES) } }).state;
  enabled = true;
  expect(state.update({ changes: { from: 10, insert: 'y' } }).state.doc.length).toBe(TEXT_BODY_MAX_BYTES);
  expect(called).toBe(true);
});
