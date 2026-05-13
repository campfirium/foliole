import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { NodeViewState } from '../../store/workspaceStore';

import {
  useActiveNodeReadingPositionRestore,
  useNavigationReadingPosition
} from './appControllerNavigationReadingPosition';
import type { ReadingPositionSyncState } from './useAppRuntime';

function createRuntime() {
  return {
    bumpReadingPositionRequest: vi.fn(),
    flushPendingEditorDraft: vi.fn(),
    flushPendingEditorDraftImmediately: vi.fn(),
    lastExpandedRightSidebarWidthRef: { current: null },
    readingPositionRef: { current: { nodeId: null, selection: null } },
    readingPositionRestoreCommandRef: { current: { nodeId: null, command: null } },
    readingPositionRestoreCommandSeqRef: { current: 0 },
    readingPositionSyncRef: {
      current: { nodeId: null, state: null as ReadingPositionSyncState | null }
    },
    recentCommandIds: [],
    registerPendingEditorDraftFlush: vi.fn()
  };
}

it('does not invent a selection when navigation only has scroll state', () => {
  const runtime = createRuntime();
  const nodeViewById: Record<string, NodeViewState | undefined> = {
    'node-2': {
      scrollTop: 5400,
      selection: null
    }
  };

  const view = renderHook(() => useNavigationReadingPosition(runtime as never, nodeViewById, vi.fn()));

  expect(view.result.current.applyNavigationReadingPosition({ focusAnchor: null, nodeId: 'node-2' })).toBe(true);
  expect(runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
  expect(runtime.readingPositionRef.current).toEqual({ nodeId: 'node-2', selection: null });
  expect(runtime.readingPositionRestoreCommandRef.current.command).toMatchObject({
    reason: 'node-navigation',
    scrollTop: 5400,
    selection: null
  });
  expect(runtime.readingPositionSyncRef.current.state).toMatchObject({
    reason: 'node-navigation',
    targetScrollTop: 5400,
    targetSelection: null
  });
});

it('creates a one-shot centered restore command for text anchor navigation', () => {
  const runtime = createRuntime();
  const view = renderHook(() => useNavigationReadingPosition(runtime as never, {}, vi.fn()));

  expect(
    view.result.current.applyNavigationReadingPosition({
      nodeId: 'node-2',
      focusAnchor: {
        id: 'hl-1',
        kind: 'highlight',
        locator: { from: 88, originalText: 'needle', to: 94 }
      }
    })
  ).toBe(true);
  expect(runtime.readingPositionRef.current).toEqual({
    nodeId: 'node-2',
    selection: { from: 88, to: 88 }
  });
  expect(runtime.readingPositionRestoreCommandRef.current.command).toMatchObject({
    commandId: 'reading-position-1',
    reason: 'anchor-navigation',
    scrollTop: 0,
    selection: { from: 88, to: 88 },
    targetViewportMode: 'center'
  });
});

it('creates one active-node restore command from persisted view state', () => {
  const runtime = createRuntime();
  const nodeViewById: Record<string, NodeViewState | undefined> = {
    'node-1': {
      scrollTop: 5400,
      selection: { from: 48000, to: 48024 }
    }
  };

  const view = renderHook(
    ({ hydrated }) => useActiveNodeReadingPositionRestore(runtime as never, 'node-1', nodeViewById, hydrated),
    { initialProps: { hydrated: false } }
  );
  expect(runtime.bumpReadingPositionRequest).not.toHaveBeenCalled();

  view.rerender({ hydrated: true });
  view.rerender({ hydrated: true });

  expect(runtime.bumpReadingPositionRequest).toHaveBeenCalledTimes(1);
  expect(runtime.readingPositionRestoreCommandRef.current.command).toMatchObject({
    reason: 'active-node-restore',
    scrollTop: 5400,
    selection: { from: 48000, to: 48000 }
  });
});
