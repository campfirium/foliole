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
      result.current.handleEditorChange('Alpha body updated');
      vi.advanceTimersByTime(400);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated');
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
      result.current.handleEditorChange('Alpha body updated');
    });

    await act(async () => {
      await closeFlush?.();
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body updated');
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
      result.current.handleEditorChange('Alpha draft');
    });

    rerender({
      committedContent: 'Beta body',
      nodeId: 'node-2'
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha draft');
    expect(onFinalizeNode).toHaveBeenCalledWith('node-1', 'Alpha draft');
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
});
