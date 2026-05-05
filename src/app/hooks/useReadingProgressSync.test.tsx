import { act, render } from '@testing-library/react';
import { useRef, type MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';

import { useReadingProgressSync } from './useReadingProgressSync';

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncReadingProgressToRuntime: vi.fn()
}));

interface HarnessProps {
  activeNodeId: string | null;
  isWorkspaceHydrated: boolean;
}

function createEditorRef(): MutableRefObject<{
  getScrollTop: () => number;
  getSelection: () => { from: number; to: number };
} | null> {
  return {
    current: {
      getScrollTop: () => 120,
      getSelection: () => ({ from: 8, to: 13 })
    }
  };
}

function HookHarness({ activeNodeId, isWorkspaceHydrated }: HarnessProps) {
  const editorRef = useRef<EditorAdapter | null>(createEditorRef().current as unknown as EditorAdapter);
  useReadingProgressSync({
    activeNodeId,
    editorRef,
    isViewingTrashNode: false,
    isWorkspaceHydrated,
    nodeViewById: {},
    setNodeViewState: () => undefined
  });
  return null;
}

describe('useReadingProgressSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not sync before workspace hydration completes', () => {
    render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={false} />);

    act(() => {
      vi.advanceTimersByTime(3000);
      window.dispatchEvent(new Event('beforeunload'));
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(syncReadingProgressToRuntime).not.toHaveBeenCalled();
  });

  it('syncs active node and view state after workspace hydration', () => {
    render(<HookHarness activeNodeId="node-2" isWorkspaceHydrated={true} />);

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(syncReadingProgressToRuntime).toHaveBeenCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 120,
          selectionFrom: 8,
          selectionTo: 13
        }
      ],
      updatedAt: expect.any(String)
    });
  });
});
