import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import {
  codeFenceLineNumbersField,
  resolveCodeBlockStateBeforeLine,
  updateCodeFenceLineNumbers
} from './liveMarkdownCodeBlocks';

describe('live markdown code block fence index', () => {
  it('resolves code block state before a visible line without rescanning earlier lines', () => {
    const state = EditorState.create({
      doc: ['title', '```ts', 'const a = 1;', '```', 'tail'].join('\n'),
      extensions: [codeFenceLineNumbersField]
    });

    expect(resolveCodeBlockStateBeforeLine(state, 1)).toBe(false);
    expect(resolveCodeBlockStateBeforeLine(state, 3)).toBe(true);
    expect(resolveCodeBlockStateBeforeLine(state, 5)).toBe(false);
  });

  it('updates cached fence lines after document edits', () => {
    const initialState = EditorState.create({
      doc: ['intro', 'body', 'tail'].join('\n'),
      extensions: [codeFenceLineNumbersField]
    });

    const transaction = initialState.update({
      changes: {
        from: initialState.doc.line(2).from,
        to: initialState.doc.line(2).to,
        insert: ['```ts', 'body', '```'].join('\n')
      }
    });

    expect(updateCodeFenceLineNumbers(
      initialState.field(codeFenceLineNumbersField),
      transaction.startState.doc,
      transaction.state.doc,
      transaction.changes
    )).toEqual([2, 4]);
    expect(resolveCodeBlockStateBeforeLine(transaction.state, 3)).toBe(true);
    expect(resolveCodeBlockStateBeforeLine(transaction.state, 5)).toBe(false);
  });
});
