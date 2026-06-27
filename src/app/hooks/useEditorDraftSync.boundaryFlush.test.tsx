import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorDraftCommit } from './useEditorDraftFlushCallbacks';
import { useEditorDraftSync } from './useEditorDraftSync';

function renderDraftSyncBoundary(onCommit: EditorDraftCommit) {
  let freshFlush: ((sourceNodeId: string | null, content: string) => boolean) | null = null;
  const hook = renderHook(() =>
    useEditorDraftSync({
      committedContent: 'Alpha body',
      nodeId: 'node-1',
      onCommit,
      onRegisterFlush: (_flush, _closeFlush, nextFreshFlush) => {
        freshFlush = nextFreshFlush ?? null;
      }
    })
  );

  return { ...hook, getFreshFlush: () => freshFlush };
}

function renderDraftSyncWithoutNode(onCommit: EditorDraftCommit) {
  return renderHook(() =>
    useEditorDraftSync({
      committedContent: '',
      nodeId: null,
      onCommit
    })
  );
}

function registerPendingDraftBoundaryTest() {
  it('commits fresh boundary content and prevents stale pending draft replay', () => {
    const onCommit = vi.fn();
    const { getFreshFlush, result } = renderDraftSyncBoundary(onCommit);

    act(() => {
      result.current.handleEditorChange('Alpha stale pending');
    });

    act(() => {
      expect(getFreshFlush()?.('node-1', 'Alpha fresh boundary')).toBe(true);
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha fresh boundary');
    expect(onCommit).not.toHaveBeenCalledWith('node-1', 'Alpha stale pending', expect.anything());
  });
}

function registerNoEvidenceBoundaryTest() {
  it('does not commit fresh active content without user input evidence', () => {
    const onCommit = vi.fn();
    const { getFreshFlush } = renderDraftSyncBoundary(onCommit);

    act(() => {
      expect(getFreshFlush()?.(null, '')).toBe(false);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });
}

function registerRawInputBoundaryTest() {
  it('commits fresh active content after raw user input reaches the editor', () => {
    const onCommit = vi.fn();
    const { getFreshFlush, result } = renderDraftSyncBoundary(onCommit);

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha close body'.length, nodeId: 'node-1' });
      expect(getFreshFlush()?.(null, 'Alpha close body')).toBe(true);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', 'Alpha close body');
  });
}

function registerEmptyBodyBoundaryTest() {
  it('preserves user-initiated empty body saves and clears the input evidence after flush', () => {
    const onCommit = vi.fn();
    const { getFreshFlush, result } = renderDraftSyncBoundary(onCommit);

    act(() => {
      result.current.handleEditorInput({ contentLength: 0, nodeId: 'node-1' });
      expect(getFreshFlush()?.(null, '')).toBe(true);
      expect(getFreshFlush()?.(null, 'Programmatic after flush')).toBe(false);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('node-1', '');
  });
}

function registerStaleRawInputBoundaryTest() {
  it('does not let stale raw input evidence authorize mismatched fresh content', () => {
    const onCommit = vi.fn();
    const { getFreshFlush, result } = renderDraftSyncBoundary(onCommit);

    act(() => {
      result.current.handleEditorInput({ contentLength: 'Alpha typed body'.length, nodeId: 'node-1' });
      expect(getFreshFlush()?.(null, '')).toBe(false);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });
}

function registerEmptyChangeGuardTest() {
  it('does not commit an empty editor change without matching raw input evidence', () => {
    const onCommit = vi.fn();
    const { result } = renderDraftSyncBoundary(onCommit);

    act(() => {
      result.current.handleEditorChange('', { nodeId: 'node-1' });
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits an empty editor change when it follows user input with empty content', () => {
    const onCommit = vi.fn();
    const { result } = renderDraftSyncBoundary(onCommit);

    act(() => {
      result.current.handleEditorInput({ contentLength: 0, nodeId: 'node-1' });
      result.current.handleEditorChange('', { nodeId: 'node-1' });
      vi.advanceTimersByTime(1200);
    });

    expect(onCommit).toHaveBeenCalledWith('node-1', '', { publishLocal: false });
  });

  it('does not commit a sourceless empty editor change into the active node fallback', () => {
    const onCommit = vi.fn();
    const { result } = renderDraftSyncWithoutNode(onCommit);

    act(() => {
      result.current.handleEditorChange('');
    });

    expect(onCommit).not.toHaveBeenCalled();
  });
}

describe('useEditorDraftSync boundary fresh flush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  registerPendingDraftBoundaryTest();
  registerNoEvidenceBoundaryTest();
  registerRawInputBoundaryTest();
  registerEmptyBodyBoundaryTest();
  registerStaleRawInputBoundaryTest();
  registerEmptyChangeGuardTest();
});
