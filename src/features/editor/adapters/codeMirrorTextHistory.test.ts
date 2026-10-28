import { cursorLineEnd, cursorLineStart } from '@codemirror/commands';
import { afterEach, describe, expect, it } from 'vitest';

import { handleMarkdownCompatibleHtmlPaste } from './htmlPaste';
import { nativeHistoryTestView } from './nativeTextHistory.testSupport';

const runtimes: ReturnType<typeof nativeHistoryTestView>[] = [];
function createView() {
  const runtime = nativeHistoryTestView('A');
  runtime.view.dispatch({ selection: { anchor: 0 } });
  runtimes.push(runtime);
  return runtime;
}
afterEach(() => { runtimes.splice(0).forEach(runtime => runtime.view.destroy()); document.body.replaceChildren(); });

describe('CodeMirror text history admission', () => {
  it('captures rich HTML paste through the native user transaction contract', () => {
    const runtime = createView();
    expect(handleMarkdownCompatibleHtmlPaste({
      getData: (format: string) => format === 'text/html' ? '<p><strong>Bold</strong> text</p>' : ''
    }, runtime.view)).toBe(true);
    expect(runtime.text()).toBe('**Bold** textA');
    expect(runtime.entries).toHaveLength(1);
    expect(runtime.entries[0]!.beforeDoc.toString()).toBe('A');
    expect(runtime.entries[0]!.nativeState!.doc.toString()).toBe('**Bold** textA');
    expect(runtime.entries[0]!.userEvent).toBe('input.paste');
    expect(runtime.replay('undo')).toBe(true);
    expect(runtime.text()).toBe('A');
  });

  it('does not turn an unannotated programmatic document sync into user history', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 0, to: 1, insert: 'Synced' } });
    expect(runtime.text()).toBe('Synced');
    expect(runtime.entries).toEqual([]);
    expect(runtime.replay('undo')).toBe(false);
  });
});

describe('CodeMirror text history transactions', () => {
  it('replays exact user changes without creating another application history entry', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    expect(runtime.entries).toHaveLength(1);
    expect(runtime.replay('undo')).toBe(true);
    expect(runtime.text()).toBe('A');
    expect(runtime.entries).toHaveLength(1);
    expect(runtime.replay('redo')).toBe(true);
    expect(runtime.text()).toBe('AB');
  });

  it('rejects an old replay snapshot when the visible document has changed', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 1, insert: 'B' }, userEvent: 'input.type' });
    const entry = runtime.top('undo');
    runtime.view.dispatch({ changes: { from: 2, insert: 'C' }, userEvent: 'input.type' });
    if (entry?.type !== 'text.edit') throw new Error('Missing text history');
    expect(runtime.controller.apply(entry, 'undo', runtime.view)).toBe(false);
    expect(runtime.text()).toBe('ABC');
  });
});

describe('CodeMirror text history selection', () => {
  it('moves to logical line boundaries in mixed-direction text', () => {
    const runtime = createView();
    runtime.view.dispatch({ changes: { from: 0, to: 1, insert: 'fooفرخة' } });
    runtime.view.dispatch({ selection: { anchor: 2 } });
    expect(cursorLineEnd(runtime.view)).toBe(true);
    expect(runtime.view.state.selection.main.head).toBe(7);
    expect(cursorLineStart(runtime.view)).toBe(true);
    expect(runtime.view.state.selection.main.head).toBe(0);
  });

  it('keeps the caret beside replacement text when another insertion reaches its boundary', () => {
    const runtime = createView();
    runtime.view.dispatch({ selection: { anchor: 0, head: 1 } });
    runtime.view.dispatch(runtime.view.state.replaceSelection('B'), { userEvent: 'input.type' });
    runtime.view.dispatch({ changes: { from: 1, insert: 'C' } });
    expect(runtime.text()).toBe('BC');
    expect(runtime.view.state.selection.main).toMatchObject({ anchor: 1, head: 1 });
    expect(runtime.entries).toHaveLength(1);
  });

  it('restores the exact pre-edit and post-edit selection through undo and redo', () => {
    const runtime = createView();
    runtime.view.dispatch({ selection: { anchor: 0, head: 1 } });
    runtime.view.dispatch(runtime.view.state.replaceSelection('B'), { userEvent: 'input.type' });
    const after = runtime.view.state.selection;
    expect(runtime.replay('undo')).toBe(true);
    expect(runtime.view.state.selection.main).toMatchObject({ anchor: 0, head: 1 });
    expect(runtime.replay('redo')).toBe(true);
    expect(runtime.view.state.selection.eq(after)).toBe(true);
  });
});
