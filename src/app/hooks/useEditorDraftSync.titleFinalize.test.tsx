import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorDraftSync } from './useEditorDraftSync';

function registerDebounceTitleFinalizationTest() {
  it('does not finalize the automatic title on debounce commit', () => {
    const onCommit = vi.fn();
    const onFinalizeNode = vi.fn();
    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit,
        onFinalizeNode
      })
    );

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha body updated'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Alpha body updated');
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated', { publishLocal: false });
    expect(onFinalizeNode).not.toHaveBeenCalled();
  });
}

function registerBoundaryTitleFinalizationTests() {
  it('finalizes the automatic title on close flush', async () => {
    const onCommit = vi.fn();
    const onFinalizeNode = vi.fn();
    let closeFlush: (() => Promise<boolean>) | null = null;

    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit,
        onFinalizeNode,
        onRegisterFlush: (_flush, nextCloseFlush) => {
          closeFlush = nextCloseFlush;
        }
      })
    );

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha body updated'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Alpha body updated');
    });

    await act(async () => {
      await closeFlush?.();
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated', { publishLocal: false });
    expect(onFinalizeNode).toHaveBeenCalledWith('node-1', 'Alpha body updated');
  });

  it('finalizes the previous node title when switching nodes', () => {
    const onCommit = vi.fn();
    const onFinalizeNode = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedContent, nodeId }) =>
        useEditorDraftSync({
          committedContent,
          nodeId,
          onCommit,
          onFinalizeNode
        }),
      {
        initialProps: {
          committedContent: 'Alpha body',
          nodeId: 'node-1'
        }
      }
    );

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha draft'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Alpha draft');
    });

    rerender({
      committedContent: 'Beta body',
      nodeId: 'node-2'
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha draft', { publishLocal: false });
    expect(onFinalizeNode).toHaveBeenCalledWith('node-1', 'Alpha draft');
  });
}

function registerTitleFinalizationFailureTests() {
  it('does not fail close flush when synchronous title finalization throws', async () => {
    const onCommit = vi.fn();
    const onFinalizeNode = vi.fn(() => {
      throw new Error('title failed');
    });
    let closeFlush: (() => Promise<boolean>) | null = null;

    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit,
        onFinalizeNode,
        onRegisterFlush: (_flush, nextCloseFlush) => {
          closeFlush = nextCloseFlush;
        }
      })
    );

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha body updated'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Alpha body updated');
    });

    await act(async () => {
      await expect(closeFlush?.()).resolves.toBe(true);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated', { publishLocal: false });
    expect(onFinalizeNode).toHaveBeenCalledWith('node-1', 'Alpha body updated');
  });

  it('does not leave an unhandled rejection when async title finalization fails', async () => {
    const onCommit = vi.fn();
    const onFinalizeNode = vi.fn(async () => {
      throw new Error('title rejected');
    });
    let closeFlush: (() => Promise<boolean>) | null = null;

    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit,
        onFinalizeNode,
        onRegisterFlush: (_flush, nextCloseFlush) => {
          closeFlush = nextCloseFlush;
        }
      })
    );

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha body updated'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Alpha body updated');
    });

    await act(async () => {
      await expect(closeFlush?.()).resolves.toBe(true);
      await Promise.resolve();
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated', { publishLocal: false });
    expect(onFinalizeNode).toHaveBeenCalledWith('node-1', 'Alpha body updated');
  });
}

describe('useEditorDraftSync title finalization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  registerDebounceTitleFinalizationTest();
  registerBoundaryTitleFinalizationTests();
  registerTitleFinalizationFailureTests();
});
