import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';

import { useReadingProgressSync } from './useReadingProgressSync';

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../store/workspaceRuntimeSync', () => ({
  syncReadingProgressToRuntime: vi.fn()
}));

function renderImmediateCaptureHarness(setNodeViewState: ReturnType<typeof vi.fn>, scrollListeners: Set<() => void>) {
  function ImmediateCaptureHarness() {
    const ref = {
      current: {
        getScrollTop: () => 5400,
        getSelection: () => ({ from: 48000, to: 48024 }),
        onScroll: (listener: () => void) => {
          scrollListeners.add(listener);
          return () => {
            scrollListeners.delete(listener);
          };
        }
      }
    } as { current: EditorAdapter | null };
    useReadingProgressSync({
      activeNodeId: 'node-2',
      editorRef: ref,
      getReadingPositionSelection: () => null,
      isImmersiveMode: false,
      isViewingTrashNode: false,
      isWorkspaceHydrated: true,
      nodeViewById: {},
      setNodeViewState
    });
    return null;
  }

  render(<ImmediateCaptureHarness />);
}

function registerCaptureTests() {
  it('does not write reading position into store while the editor is still scrolling', () => {
    const setNodeViewState = vi.fn();
    const scrollListeners = new Set<() => void>();
    renderImmediateCaptureHarness(setNodeViewState, scrollListeners);

    act(() => {
      for (const listener of scrollListeners) {
        listener();
      }
    });

    expect(setNodeViewState).not.toHaveBeenCalled();
  });

  it('does not update the in-memory reading position while anchor navigation restore is applying', () => {
    const setNodeViewState = vi.fn();
    const scrollListeners = new Set<() => void>();

    function ImmediateCaptureHarness() {
      const ref = {
        current: {
          getScrollTop: () => 5400,
          getSelection: () => ({ from: 48000, to: 48024 }),
          onScroll: (listener: () => void) => {
            scrollListeners.add(listener);
            return () => {
              scrollListeners.delete(listener);
            };
          }
        }
      } as { current: EditorAdapter | null };
      useReadingProgressSync({
        activeNodeId: 'node-2',
        editorRef: ref,
        getReadingPositionSelection: () => ({ from: 48000, to: 48024 }),
        getReadingPositionSyncState: () => ({
          reason: 'anchor-navigation',
          startedAt: Date.now(),
          targetSelection: { from: 48000, to: 48024 }
        }),
        isImmersiveMode: false,
        isViewingTrashNode: false,
        isWorkspaceHydrated: true,
        nodeViewById: {},
        setNodeViewState
      });
      return null;
    }

    render(<ImmediateCaptureHarness />);

    act(() => {
      for (const listener of scrollListeners) {
        listener();
      }
    });

    expect(setNodeViewState).not.toHaveBeenCalled();
  });
}

describe('useReadingProgressSync scroll persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  registerCaptureTests();
});
