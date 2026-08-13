import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import type { EditorTextEditOperationEntry } from '../model/editorOperationHistory';

import {
  applyCodeMirrorTextHistory,
  collectCodeMirrorTextHistoryEntries
} from './codeMirrorTextHistory';

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

describe('CodeMirror text history transactions', () => {
  it('captures exact user changes and replays undo without creating a second history entry', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    const entry = runtime.entries[0]!;

    expect(entry).toMatchObject({ afterContent: 'AB', beforeContent: 'A', nodeId: 'node-1' });
    expect(applyCodeMirrorTextHistory({
      changes: entry.inverseChanges,
      expectedContent: 'AB',
      expectedNextContent: 'A',
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
      expectedContent: 'AB',
      expectedNextContent: 'A',
      selection: entry.beforeSelection,
      userEvent: 'undo',
      view: runtime.view
    })).toBe(false);
    expect(runtime.view.state.doc.toString()).toBe('ABC');
  });

  it('restores the exact pre-edit selection during undo', () => {
    const runtime = createView();
    runtime.view.dispatch({ selection: { anchor: 0, head: 1 } });
    runtime.view.dispatch(runtime.view.state.replaceSelection('B'), { userEvent: 'input.type' });
    const entry = runtime.entries[0]!;

    expect(applyCodeMirrorTextHistory({
      changes: entry.inverseChanges,
      expectedContent: 'B',
      expectedNextContent: 'A',
      selection: entry.beforeSelection,
      userEvent: 'undo',
      view: runtime.view
    })).toBe(true);
    expect(runtime.view.state.selection.main).toMatchObject({ anchor: 0, head: 1 });

    expect(applyCodeMirrorTextHistory({
      changes: entry.forwardChanges,
      expectedContent: 'A',
      expectedNextContent: 'B',
      selection: entry.afterSelection,
      userEvent: 'redo',
      view: runtime.view
    })).toBe(true);
    expect(runtime.view.state.selection.main).toMatchObject(entry.afterSelection.ranges[0]!);
  });
});
