import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter, EditorScrollEvent } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

import { useReadingProgressSync } from './useReadingProgressSync';

vi.mock('../../shared/diagnostics/debugTrace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/diagnostics/debugTrace')>()),
  pushDebugTrace: vi.fn()
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncPdfImageExcerptNodeMutationToRuntime: vi.fn(),
  syncReadingProgressToRuntime: vi.fn()
}));

// The desktop controller passes fresh getters on every render, like this harness.
function createEditor() {
  const listeners = new Set<(event: EditorScrollEvent) => void>();
  let scrollTop = 100;
  const adapter = {
    getScrollTop: () => scrollTop,
    getSelection: () => ({ from: 4, to: 4 }),
    onScroll: (listener: (event: EditorScrollEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  } as unknown as EditorAdapter;
  const editorRef: { current: EditorAdapter | null } = { current: adapter };
  return {
    // Like setConnectedEditorAdapter: the adapter lands in the ref without a re-render.
    attach() {
      editorRef.current = adapter;
    },
    detach() {
      editorRef.current = null;
    },
    editorRef,
    scroll(next: number) {
      scrollTop = next;
      for (const listener of listeners) listener({ userInitiated: true });
    }
  };
}

function Host(props: { activeNodeId: string; editor: ReturnType<typeof createEditor>; renderCount: number }) {
  useReadingProgressSync({
    activeNodeId: props.activeNodeId,
    editorRef: props.editor.editorRef,
    getReadingPositionSelection: () => null,
    getReadingPositionSyncState: () => null,
    isImmersiveMode: false,
    isViewingTrashNode: false,
    isWorkspaceHydrated: true,
    nodeViewById: {},
    onProgrammaticScroll: () => undefined,
    setNodeViewState: () => undefined
  });
  return null;
}

describe('useReadingProgressSync host re-renders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes reading progress once per article, not once per host render', () => {
    const flushes = () =>
      vi.mocked(pushDebugTrace).mock.calls.filter(([event]) => event === 'reading-progress.flush-runtime').length;
    const editor = createEditor();
    const view = render(<Host activeNodeId="node-1" editor={editor} renderCount={0} />);
    expect(flushes()).toBe(1);

    for (let renderCount = 1; renderCount <= 5; renderCount += 1) {
      view.rerender(<Host activeNodeId="node-1" editor={editor} renderCount={renderCount} />);
    }
    expect(flushes()).toBe(1);

    view.rerender(<Host activeNodeId="node-2" editor={editor} renderCount={6} />);
    expect(flushes()).toBe(2);
  });

  it('subscribes to scrolling once the editor attaches after the article opened', () => {
    const editor = createEditor();
    editor.detach();
    const view = render(<Host activeNodeId="node-1" editor={editor} renderCount={0} />);
    editor.attach();
    view.rerender(<Host activeNodeId="node-1" editor={editor} renderCount={1} />);
    vi.mocked(syncReadingProgressToRuntime).mockClear();

    act(() => {
      editor.scroll(1200);
      vi.advanceTimersByTime(400);
    });
    expect(syncReadingProgressToRuntime).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncReadingProgressToRuntime).mock.calls[0]?.[0]).toMatchObject({
      nodeViewStates: [expect.objectContaining({ nodeId: 'node-1', scrollTop: 1200 })]
    });
  });

  it('keeps a pending scroll save when the host re-renders during the debounce', () => {
    const editor = createEditor();
    const view = render(<Host activeNodeId="node-1" editor={editor} renderCount={0} />);
    vi.mocked(syncReadingProgressToRuntime).mockClear();

    act(() => {
      editor.scroll(900);
      vi.advanceTimersByTime(200);
    });
    view.rerender(<Host activeNodeId="node-1" editor={editor} renderCount={1} />);
    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(syncReadingProgressToRuntime).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncReadingProgressToRuntime).mock.calls[0]?.[0]).toMatchObject({
      activeNodeId: 'node-1',
      nodeViewStates: [expect.objectContaining({ nodeId: 'node-1', scrollTop: 900 })],
      source: 'user-scroll'
    });
  });
});
