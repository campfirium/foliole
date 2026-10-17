/* global document, window, KeyboardEvent */
// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';

import { observeTimingEditor } from './macos-a5-sync-timing-editor-evidence.mjs';

it('records editor and DOM selections before a key without changing either', async () => {
  const parent = document.createElement('section');
  parent.setAttribute('data-companion-readable-document', 'true');
  document.body.append(parent);
  const view = new EditorView({ doc: 'Sync timing clean text', parent });
  let observation;
  try {
    view.dispatch({ selection: { anchor: 0, head: 4 } });
    const range = document.createRange();
    range.setStart(view.contentDOM.firstChild.firstChild, 0);
    range.setEnd(view.contentDOM.firstChild.firstChild, 4);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    observation = await observeTimingEditor({ evaluate: callback => callback() });
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
    const events = await observation.close(); observation = null;
    const event = events.find(value => value.phase === 'keydown');
    expect(event.cm).toMatchObject({ from: 0, to: 4, text: 'Sync' });
    expect(event.dom).toMatchObject({ text: 'Sync', collapsed: false });
    expect(view.state.sliceDoc()).toBe('Sync timing clean text');
    expect(view.state.selection.main.to).toBe(4);
    expect(globalThis.__syncTimingEditorEvidence).toBeUndefined();
  } finally { await observation?.close(); view.destroy(); parent.remove(); }
});

it('preserves native results and restores the original bridge after observing timings', async () => {
  const previous = globalThis.Capacitor;
  const result = { changes: 1 };
  const original = async () => result;
  globalThis.Capacitor = { nativePromise: original };
  try {
    const observation = await observeTimingEditor({ evaluate: callback => callback() });
    expect(await globalThis.Capacitor.nativePromise('CapacitorSQLite', 'commitTransaction', {})).toBe(result);
    const events = await observation.close();
    expect(events.filter(value => value.phase.startsWith('native:')).map(value => value.phase))
      .toEqual(['native:start', 'native:end']);
    expect(globalThis.Capacitor.nativePromise).toBe(original);
  } finally { globalThis.Capacitor = previous; }
});
