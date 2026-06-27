import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorDraftSync } from './useEditorDraftSync';

describe('useEditorDraftSync boundary fresh flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commits fresh boundary content and prevents stale pending draft replay', () => {
    const onCommit = vi.fn();
    let freshFlush: ((sourceNodeId: string | null, content: string) => boolean) | null = null;

    const { result } = renderHook(() =>
      useEditorDraftSync({
        committedContent: 'Alpha body',
        nodeId: 'node-1',
        onCommit,
        onRegisterFlush: (_flush, _closeFlush, nextFreshFlush) => {
          freshFlush = nextFreshFlush ?? null;
        }
      })
    );

    act(() => {
      result.current.handleEditorChange('Alpha stale pending');
    });

    act(() => {
      expect(freshFlush?.('node-1', 'Alpha fresh boundary')).toBe(true);
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha fresh boundary');
    expect(onCommit).not.toHaveBeenCalledWith('node-1', 'Alpha stale pending', expect.anything());
  });
});
