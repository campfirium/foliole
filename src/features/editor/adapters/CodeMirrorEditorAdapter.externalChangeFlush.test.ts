import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeMirrorEditorAdapter } from './CodeMirrorEditorAdapter';

function createAdapter() {
  const host = document.createElement('div');
  document.body.append(host);
  const onChange = vi.fn();
  const onDocumentInput = vi.fn();
  const adapter = new CodeMirrorEditorAdapter(host, {
    initialContent: 'old content',
    onChange,
    onDocumentInput
  });
  const view = (adapter as unknown as { view: EditorView }).view;
  return { adapter, onChange, onDocumentInput, view };
}

describe('CodeMirrorEditorAdapter external change flush boundaries', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('flushes pending old-node content before switching node id', () => {
    vi.useFakeTimers();
    const { adapter, onChange, view } = createAdapter();
    adapter.setNodeId('node-A');

    view.dispatch({ changes: { from: 11, insert: ' draft' } });
    expect(onChange).not.toHaveBeenCalled();

    adapter.setNodeId('node-B');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('old content draft', { nodeId: 'node-A' });
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
    adapter.destroy();
  });

  it('reports raw document input before the buffered content flush', () => {
    vi.useFakeTimers();
    const { adapter, onChange, onDocumentInput, view } = createAdapter();
    adapter.setNodeId('node-A');

    view.dispatch({ changes: { from: 11, insert: ' draft' } });

    expect(onDocumentInput).toHaveBeenCalledWith({ isComposing: false, nodeId: 'node-A' });
    expect(onChange).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(onChange).toHaveBeenCalledWith('old content draft', { nodeId: 'node-A' });
    adapter.destroy();
  });
});
