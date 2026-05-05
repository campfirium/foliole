import { act, render } from '@testing-library/react';
import { useRef, type MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

import { useReadingProgressSync } from './useReadingProgressSync';

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncReadingProgressToRuntime: vi.fn()
}));

interface HarnessProps {
  activeNodeId: string | null;
  isWorkspaceHydrated: boolean;
  nodeViewById?: Record<string, NodeViewState | undefined>;
  scrollTop?: number;
  selection?: { from: number; to: number };
  setNodeViewState?: (nodeId: string, viewState: NodeViewState) => void;
}

function createEditorRef(
  scrollTop: number,
  selection: { from: number; to: number }
): MutableRefObject<{
  getScrollTop: () => number;
  getSelection: () => { from: number; to: number };
} | null> {
  return {
    current: {
      getScrollTop: () => scrollTop,
      getSelection: () => selection
    }
  };
}

function HookHarness({
  activeNodeId,
  isWorkspaceHydrated,
  nodeViewById = {},
  scrollTop = 120,
  selection = { from: 8, to: 13 },
  setNodeViewState = () => undefined
}: HarnessProps) {
  const editorRef = useRef<EditorAdapter | null>(createEditorRef(scrollTop, selection).current as unknown as EditorAdapter);
  editorRef.current = createEditorRef(scrollTop, selection).current as unknown as EditorAdapter;
  useReadingProgressSync({
    activeNodeId,
    editorRef,
    isViewingTrashNode: false,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });
  return null;
}

function buildNodeSwitchHarnessProps(setNodeViewState: (nodeId: string, viewState: NodeViewState) => void): HarnessProps {
  return {
    activeNodeId: 'node-2',
    isWorkspaceHydrated: true,
    nodeViewById: {
      'node-2': {
        scrollTop: 24,
        selection: { from: 2, to: 6 }
      }
    },
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 },
    setNodeViewState
  };
}

function buildPreviousNodeHarnessProps(setNodeViewState: (nodeId: string, viewState: NodeViewState) => void): HarnessProps {
  return {
    activeNodeId: 'node-1',
    isWorkspaceHydrated: true,
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 },
    setNodeViewState
  };
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

    expect(syncReadingProgressToRuntime).toHaveBeenCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [],
      updatedAt: expect.any(String)
    });
  });

  it('does not overwrite stored reading position during node switching', () => {
    const setNodeViewState = vi.fn();
    const view = render(<HookHarness {...buildPreviousNodeHarnessProps(setNodeViewState)} />);

    vi.clearAllMocks();

    view.rerender(<HookHarness {...buildNodeSwitchHarnessProps(setNodeViewState)} />);

    expect(setNodeViewState).toHaveBeenCalledWith('node-1', {
      scrollTop: 5400,
      selection: { from: 48000, to: 48024 }
    });
    expect(syncReadingProgressToRuntime).toHaveBeenLastCalledWith({
      activeNodeId: 'node-2',
      nodeViewStates: [
        {
          nodeId: 'node-2',
          scrollTop: 24,
          selectionFrom: 2,
          selectionTo: 6
        }
      ],
      updatedAt: expect.any(String)
    });
  });
});
