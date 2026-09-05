import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { markdownFormattingKeymap } from './codeMirrorMarkdownFormatting';

function runFormattingShortcut(args: {
  anchor: number;
  content: string;
  head: number;
  key: 'Mod-b' | 'Mod-i';
  readOnly?: boolean;
}) {
  let state = EditorState.create({
    doc: args.content,
    extensions: args.readOnly ? [EditorState.readOnly.of(true)] : [],
    selection: EditorSelection.single(args.anchor, args.head)
  });
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    }
  };
  const binding = markdownFormattingKeymap.find((candidate) => candidate.key === args.key);
  const handled = binding?.run?.(view as never) ?? false;
  const main = state.selection.main;
  return { anchor: main.anchor, content: state.doc.toString(), handled, head: main.head };
}

describe('Markdown inline formatting shortcuts', () => {
  it('wraps and unwraps a bold selection while preserving the selected text', () => {
    const wrapped = runFormattingShortcut({ anchor: 0, content: 'hello', head: 5, key: 'Mod-b' });
    expect(wrapped).toEqual({ anchor: 2, content: '**hello**', handled: true, head: 7 });

    expect(runFormattingShortcut({
      anchor: wrapped.anchor,
      content: wrapped.content,
      head: wrapped.head,
      key: 'Mod-b'
    })).toEqual({ anchor: 0, content: 'hello', handled: true, head: 5 });
  });

  it('inserts paired italic markers at the caret and leaves the caret between them', () => {
    expect(runFormattingShortcut({ anchor: 2, content: 'hi', head: 2, key: 'Mod-i' }))
      .toEqual({ anchor: 3, content: 'hi**', handled: true, head: 3 });
  });

  it('adds italic formatting inside an existing bold span without removing bold', () => {
    expect(runFormattingShortcut({ anchor: 2, content: '**hello**', head: 7, key: 'Mod-i' }))
      .toEqual({ anchor: 3, content: '***hello***', handled: true, head: 8 });
  });

  it('does not edit a read-only document', () => {
    expect(runFormattingShortcut({ anchor: 0, content: 'hello', head: 5, key: 'Mod-b', readOnly: true }))
      .toEqual({ anchor: 0, content: 'hello', handled: false, head: 5 });
  });
});
