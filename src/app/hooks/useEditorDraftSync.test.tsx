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

    expect(onCommit).toHaveBeenCalledWith('Alpha body updated');
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

    expect(onCommit).toHaveBeenCalledWith('Alpha body updated');
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
      vi.advanceTimersByTime(400);
    });

    expect(alphaCommit).toHaveBeenCalledWith('Alpha draft');
    expect(alphaCommit).not.toHaveBeenCalledWith('Beta draft');
    expect(betaCommit).toHaveBeenCalledWith('Beta draft');
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
});
