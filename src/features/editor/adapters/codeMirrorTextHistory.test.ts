import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { digestEditorContent } from '../model/editorContentDigest';
import type { EditorTextEditOperationEntry } from '../model/editorOperationHistory';

import {
  applyCodeMirrorTextHistory,
  collectCodeMirrorTextHistoryEntries
} from './codeMirrorTextHistory';
import { handleMarkdownCompatibleHtmlPaste } from './htmlPaste';

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.replaceChildren();
});

function createView() {
  const entries: EditorTextEditOperationEntry[] = [];
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: 'A',
      extensions: [EditorView.updateListener.of((update) => {
        entries.push(...collectCodeMirrorTextHistoryEntries(update, 'node-1'));
      })]
    })
  });
  return { entries, view };
}

describe('CodeMirror text history admission', () => {
  it('captures rich HTML paste through the CodeMirror user transaction contract', () => {
    const runtime = createView();

    expect(handleMarkdownCompatibleHtmlPaste({
      getData: (format: string) => format === 'text/html' ? '<p><strong>Bold</strong> text</p>' : ''
    }, runtime.view)).toBe(true);

    expect(runtime.view.state.doc.toString()).toBe('**Bold** textA');
    expect(runtime.entries).toHaveLength(1);
    expect(runtime.entries[0]).toMatchObject({
      afterDigest: digestEditorContent('**Bold** textA'),
      beforeDigest: digestEditorContent('A'),
      userEvent: 'input.paste'
    });
  });

  it('does not turn an unannotated programmatic document sync into user history', () => {
    const runtime = createView();

    runtime.view.dispatch({ changes: { from: 0, to: 1, insert: 'Synced' } });

    expect(runtime.view.state.doc.toString()).toBe('Synced');
    expect(runtime.entries).toEqual([]);
  });
});

describe('CodeMirror text history transactions', () => {
  it('captures exact user changes and replays undo without creating a second history entry', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    const entry = runtime.entries[0]!;

    expect(entry).toMatchObject({
      afterDigest: digestEditorContent('AB'),
      beforeDigest: digestEditorContent('A'),
      nodeId: 'node-1'
    });
    expect(applyCodeMirrorTextHistory({
      changes: entry.inverseChanges,
      expectedDigest: digestEditorContent('AB'),
      expectedNextDigest: digestEditorContent('A'),
      selection: entry.beforeSelection,
      userEvent: 'undo',
      view: runtime.view
    })).toBe(true);
    expect(runtime.view.state.doc.toString()).toBe('A');
    expect(runtime.entries).toHaveLength(1);
  });

  it('rejects replay when the visible document no longer matches its evidence', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    const entry = runtime.entries[0]!;
    runtime.view.dispatch({ changes: { from: 2, insert: 'C' }, userEvent: 'input.type' });

    expect(applyCodeMirrorTextHistory({
      changes: entry.inverseChanges,
      expectedDigest: digestEditorContent('AB'),
      expectedNextDigest: digestEditorContent('A'),
      selection: entry.beforeSelection,
      userEvent: 'undo',
      view: runtime.view
    })).toBe(false);
    expect(runtime.view.state.doc.toString()).toBe('ABC');
  });
});

describe('CodeMirror text history selection', () => {
  it('restores the exact pre-edit selection during undo', () => {
    const runtime = createView();
    runtime.view.dispatch({ selection: { anchor: 0, head: 1 } });
    runtime.view.dispatch(runtime.view.state.replaceSelection('B'), { userEvent: 'input.type' });
    const entry = runtime.entries[0]!;

    expect(applyCodeMirrorTextHistory({
      changes: entry.inverseChanges,
      expectedDigest: digestEditorContent('B'),
      expectedNextDigest: digestEditorContent('A'),
      selection: entry.beforeSelection,
      userEvent: 'undo',
      view: runtime.view
    })).toBe(true);
    expect(runtime.view.state.selection.main).toMatchObject({ anchor: 0, head: 1 });

    expect(applyCodeMirrorTextHistory({
      changes: entry.forwardChanges,
      expectedDigest: digestEditorContent('A'),
      expectedNextDigest: digestEditorContent('B'),
      selection: entry.afterSelection,
      userEvent: 'redo',
      view: runtime.view
    })).toBe(true);
    expect(runtime.view.state.selection.main).toMatchObject(entry.afterSelection.ranges[0]!);
  });
});
