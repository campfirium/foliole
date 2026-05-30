import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorDraftSync } from './useEditorDraftSync';

function registerDebouncePersistenceTest() {
  it('keeps editor changes in draft state until the debounce fires', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit
      })
    );

    act(() => {
      result.current.handleEditorChange('Alpha body updated');
    });

    expect(result.current.editorContent).toBe('Alpha body updated');
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(399);
    });

    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated');
  });

}

function registerCloseFlushTest() {
  it('registers a close flush that commits the latest pending draft', async () => {
    const onCommit = vi.fn();
    let closeFlush: (() => Promise<boolean>) | null = null;

    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit,
        onRegisterFlush: (_flush, nextCloseFlush) => {
          closeFlush = nextCloseFlush;
        }
      })
    );

    act(() => {
      result.current.handleEditorChange('Alpha body updated');
    });

    await act(async () => {
      await expect(closeFlush?.()).resolves.toBe(true);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated');
  });

  it('flushes the pending draft on unmount', () => {
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit
      })
    );

    act(() => {
      result.current.handleEditorChange('Alpha unmount draft');
    });

    unmount();

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha unmount draft');
  });

}

function registerNodeSwitchDisplayTest() {
  it('shows committed content immediately after switching to another node', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedContent, nodeId }) =>
        useEditorDraftSync({
          committedContent,
          nodeId,
          onCommit
        }),
      {
        initialProps: {
          committedContent: 'Alpha body',
          nodeId: 'node-1'
        }
      }
    );

    act(() => {
      result.current.handleEditorChange('Alpha draft');
    });

    expect(result.current.editorContent).toBe('Alpha draft');

    rerender({
      committedContent: 'Beta body',
      nodeId: 'node-2'
    });

    expect(result.current.editorContent).toBe('Beta body');
  });
}

function registerNodeSwitchCommitIsolationTest() {
  it('does not commit the next node draft through the previous node debounce timer', () => {
    const alphaCommit = vi.fn();
    const betaCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedContent, nodeId, onCommit }) =>
        useEditorDraftSync({
          committedContent,
          nodeId,
          onCommit
        }),
      {
        initialProps: {
          committedContent: 'Alpha body',
          nodeId: 'node-1',
          onCommit: alphaCommit
        }
      }
    );

    act(() => {
      result.current.handleEditorChange('Alpha draft');
    });

    rerender({
      committedContent: 'Beta body',
      nodeId: 'node-2',
      onCommit: betaCommit
    });

    act(() => {
      result.current.handleEditorChange('Beta draft');
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(alphaCommit).toHaveBeenCalledWith('node-1', 'Alpha draft');
    expect(alphaCommit).not.toHaveBeenCalledWith('node-1', 'Beta draft');
    expect(betaCommit).toHaveBeenCalledWith('node-2', 'Beta draft');
  });

}

function registerStaleNodeChangeTest() {
  it('keeps a delayed old-node editor change bound to the source node after switching', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedContent, nodeId }) => useEditorDraftSync({ committedContent, nodeId, onCommit }),
      { initialProps: { committedContent: 'Alpha body', nodeId: 'node-1' } }
    );

    rerender({ committedContent: 'Beta body', nodeId: 'node-2' });

    act(() => {
      result.current.handleEditorChange('Alpha late draft', { nodeId: 'node-1' });
    });

    expect(result.current.editorContent).toBe('Beta body');

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha late draft');
    expect(onCommit).not.toHaveBeenCalledWith('node-2', 'Alpha late draft');
  });

}

function registerCommittedContentRefreshTest() {
  it('preserves an uncommitted same-node draft when committed content refreshes', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedContent }) => useEditorDraftSync({ committedContent, nodeId: 'node-1', onCommit }),
      { initialProps: { committedContent: 'Alpha body' } }
    );

    act(() => {
      result.current.handleEditorChange('Alpha local draft');
    });

    rerender({ committedContent: 'Alpha remote refresh' });

    expect(result.current.editorContent).toBe('Alpha local draft');

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha local draft');
  });
}

describe('useEditorDraftSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  registerDebouncePersistenceTest();
  registerCloseFlushTest();
  registerNodeSwitchDisplayTest();
  registerNodeSwitchCommitIsolationTest();
  registerStaleNodeChangeTest();
  registerCommittedContentRefreshTest();
});
