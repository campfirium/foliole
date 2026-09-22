import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, expect, it } from 'vitest';

import type { EditorTextEditOperationEntry } from '../model/editorOperationHistory';

import { markdownFormattingKeymap } from './codeMirrorMarkdownFormatting';
import { applyCodeMirrorTextHistory, collectCodeMirrorTextHistoryEntries } from './codeMirrorTextHistory';
import { markdownInputAssist } from './markdownInputAssist';

const views: EditorView[] = [];

function editor(content: string) {
  const entries: EditorTextEditOperationEntry[] = [];
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: content,
      selection: { anchor: content.length },
      extensions: [markdownInputAssist, EditorView.updateListener.of((update) => {
        entries.push(...collectCodeMirrorTextHistoryEntries(update, 'topic'));
      })]
    })
  });
  views.push(view);
  return { view, entries, text: () => view.state.doc.toString() };
}

function replay(view: EditorView, entry: EditorTextEditOperationEntry, mode: 'undo' | 'redo') {
  const undo = mode === 'undo';
  expect(applyCodeMirrorTextHistory({
    changes: undo ? entry.inverseChanges : entry.forwardChanges,
    expectedDigest: undo ? entry.afterDigest : entry.beforeDigest,
    expectedNextDigest: undo ? entry.beforeDigest : entry.afterDigest,
    selection: undo ? entry.beforeSelection : entry.afterSelection,
    userEvent: mode,
    view
  })).toBe(true);
}

function input(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main;
  const handled = view.state.facet(EditorView.inputHandler).some((handler) =>
    handler(view, from, to, text, () => view.state.update({ changes: { from, to, insert: text } })));
  expect(handled).toBe(true);
}

afterEach(() => views.splice(0).forEach((view) => view.destroy()));

it.each([['Mod-b', '**'], ['Mod-i', '*']])('undoes %s then earlier typing and redoes both', (key, marker) => {
  const runtime = editor('important');
  runtime.view.dispatch({ changes: { from: 9, insert: ' typed' }, userEvent: 'input.type' });
  runtime.view.dispatch({ selection: { anchor: 9, head: 0 } });
  expect(markdownFormattingKeymap.find((binding) => binding.key === key)?.run?.(runtime.view)).toBe(true);
  expect(runtime.text()).toBe(`${marker}important${marker} typed`);
  expect(runtime.entries).toHaveLength(2);
  replay(runtime.view, runtime.entries[1]!, 'undo');
  expect(runtime.text()).toBe('important typed');
  expect(runtime.view.state.selection.main).toMatchObject({ anchor: 9, head: 0 });
  replay(runtime.view, runtime.entries[0]!, 'undo');
  expect(runtime.text()).toBe('important');
  replay(runtime.view, runtime.entries[0]!, 'redo');
  replay(runtime.view, runtime.entries[1]!, 'redo');
  expect(runtime.text()).toBe(`${marker}important${marker} typed`);
});

it('undoes fence completion and previous typing and redoes both', () => {
  const runtime = editor('');
  runtime.view.dispatch({ changes: { from: 0, insert: '``' }, selection: { anchor: 2 }, userEvent: 'input.type' });
  input(runtime.view, '`');
  expect(runtime.text()).toBe('```\n\n```');
  expect(runtime.entries).toHaveLength(2);
  replay(runtime.view, runtime.entries[1]!, 'undo');
  expect(runtime.text()).toBe('``');
  expect(runtime.view.state.selection.main.head).toBe(2);
  replay(runtime.view, runtime.entries[0]!, 'undo');
  expect(runtime.text()).toBe('');
  replay(runtime.view, runtime.entries[0]!, 'redo');
  replay(runtime.view, runtime.entries[1]!, 'redo');
  expect(runtime.text()).toBe('```\n\n```');
  expect(runtime.view.state.selection.main.head).toBe(4);
});

it('records the existing closing-fence insertion on Enter as reversible input', () => {
  const original = '```\ncode\n';
  const runtime = editor(original);
  input(runtime.view, '\n');
  const completed = runtime.text();
  expect(completed).toBe('```\ncode\n\n```\n');
  expect(runtime.entries).toHaveLength(1);
  replay(runtime.view, runtime.entries[0]!, 'undo');
  expect(runtime.text()).toBe(original);
  replay(runtime.view, runtime.entries[0]!, 'redo');
  expect(runtime.text()).toBe(completed);
});
