import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorDraftSync } from './useEditorDraftSync';

describe('useEditorDraftSync history boundaries', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preserves an uncommitted same-node draft when committed content refreshes', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ committedContent }) => useEditorDraftSync({ committedContent, nodeId: 'node-1', onCommit }),
      { initialProps: { committedContent: 'Alpha body' } }
    );

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha local draft'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Alpha local draft');
    });
    rerender({ committedContent: 'Alpha remote refresh' });
    expect(result.current.editorContent).toBe('Alpha local draft');
    act(() => vi.advanceTimersByTime(1200));
    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha local draft', { publishLocal: false });
  });

  it('replaces an older pending draft and title refresh with the replayed body', () => {
    const onCommit = vi.fn();
    const onFinalizeNode = vi.fn();
    const { result } = renderHook(() => useEditorDraftSync({
      committedContent: 'Alpha body',
      nodeId: 'node-1',
      onCommit,
      onFinalizeNode
    }));

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Stale pending draft'.length, nodeId: 'node-1' });
      result.current.handleEditorChange('Stale pending draft');
      result.current.handleEditorChange('Alpha body', { nodeId: 'node-1', origin: 'history' });
      vi.advanceTimersByTime(1200);
    });

    expect(result.current.editorContent).toBe('Alpha body');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha body', {
      historyReplay: true,
      publishLocal: true
    });
    expect(onCommit).not.toHaveBeenCalledWith('node-1', 'Stale pending draft', expect.anything());
    expect(onFinalizeNode).not.toHaveBeenCalled();
  });
});
