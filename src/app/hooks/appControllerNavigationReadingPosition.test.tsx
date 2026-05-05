import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { NodeViewState } from '../../store/workspaceStore';

import { useNavigationReadingPosition } from './appControllerNavigationReadingPosition';
import type { ReadingPositionSyncState } from './useAppRuntime';

it('does not invent a selection when navigation only has scroll state', () => {
  const runtime = {
    bumpReadingPositionRequest: vi.fn(),
    readingPositionRef: { current: { nodeId: null, selection: null } },
    readingPositionSyncRef: {
      current: { nodeId: null, state: null as ReadingPositionSyncState | null }
    }
  };
  const nodeViewById: Record<string, NodeViewState | undefined> = {
    'node-2': {
      scrollTop: 5400,
      selection: null
    }
  };

  const view = renderHook(() => useNavigationReadingPosition(runtime, nodeViewById, vi.fn()));

  expect(view.result.current.applyNavigationReadingPosition({ nodeId: 'node-2' })).toBe(true);
  expect(runtime.bumpReadingPositionRequest).not.toHaveBeenCalled();
  expect(runtime.readingPositionRef.current).toEqual({ nodeId: null, selection: null });
  expect(runtime.readingPositionSyncRef.current).toEqual({ nodeId: null, state: null });
});
