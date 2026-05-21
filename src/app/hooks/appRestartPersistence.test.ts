import type { MutableRefObject } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import { createMockEditorAdapter } from '../../test/editorAdapterTestSupport';

import { restartAppWithReadingProgress } from './appRestartPersistence';

const mocks = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn(),
  restartMainWindowDevApp: vi.fn(() => Promise.resolve()),
  logRuntimeWarning: vi.fn()
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: mocks.getRuntimeInvoke
}));

vi.mock('../../shared/platform/windowControls', () => ({
  restartMainWindowDevApp: mocks.restartMainWindowDevApp
}));

vi.mock('../../shared/platform/runtimeLogging', () => ({
  logRuntimeWarning: mocks.logRuntimeWarning
}));

function createEditorRef(
  scrollTop = 5400,
  selection = { from: 12, to: 18 },
  options?: {
    isPositionNearViewportRatio?: () => boolean;
    primaryVisiblePosition?: number | null;
  }
) {
  return {
    current: createMockEditorAdapter({
      getPrimaryVisiblePosition: () => options?.primaryVisiblePosition ?? null,
      getScrollTop: () => scrollTop,
      getSelection: () => selection,
      ...definedProps({ isPositionNearViewportRatio: options?.isPositionNearViewportRatio })
    })
  } satisfies MutableRefObject<EditorAdapter | null>;
}

beforeEach(() => {
  mocks.getRuntimeInvoke.mockReset();
  mocks.restartMainWindowDevApp.mockClear();
  mocks.logRuntimeWarning.mockClear();
});

it('flushes the current reading position before restarting', async () => {
  const invoke = vi.fn(() => Promise.resolve(null));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);
  const setNodeViewState = vi.fn();

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(),
    getReadingPositionSelection: () => ({ from: 48000, to: 48000 }),
    isImmersiveMode: true,
    isViewingTrashNode: false,
    nodeViewById: {},
    setNodeViewState
  });

  expect(setNodeViewState).toHaveBeenCalledWith('node-2', {
    scrollTop: 5400,
    selection: { from: 48000, to: 48000 }
  });
  expect(invoke).toHaveBeenCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-2',
        scrollTop: 5400,
        selectionFrom: 48000,
        selectionTo: 48000
      }
    ],
    source: 'close-flush',
    updatedAt: expect.any(String)
  });
  expect(mocks.restartMainWindowDevApp).toHaveBeenCalledTimes(1);
});

it('still restarts when the flush fails', async () => {
  const invoke = vi.fn(() => Promise.reject(new Error('save failed')));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(),
    getReadingPositionSelection: () => ({ from: 48000, to: 48000 }),
    isImmersiveMode: true,
    isViewingTrashNode: false,
    nodeViewById: {},
    setNodeViewState: vi.fn()
  });

  expect(mocks.logRuntimeWarning).toHaveBeenCalled();
  expect(mocks.restartMainWindowDevApp).toHaveBeenCalledTimes(1);
});

it('normalizes scroll and selection before flushing on restart', async () => {
  const invoke = vi.fn(() => Promise.resolve(null));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(465.5, { from: 542.9, to: 542.9 }),
    getReadingPositionSelection: () => ({ from: 542.9, to: 542.9 }),
    isImmersiveMode: true,
    isViewingTrashNode: false,
    nodeViewById: {},
    setNodeViewState: vi.fn()
  });

  expect(invoke).toHaveBeenCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-2',
        scrollTop: 465,
        selectionFrom: 542,
        selectionTo: 542
      }
    ],
    source: 'close-flush',
    updatedAt: expect.any(String)
  });
});

it('preserves previously saved node positions when restarting from another node', async () => {
  const invoke = vi.fn(() => Promise.resolve(null));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(5400, { from: 48000, to: 48000 }),
    getReadingPositionSelection: () => ({ from: 48000, to: 48000 }),
    isImmersiveMode: true,
    isViewingTrashNode: false,
    nodeViewById: {
      'node-1': {
        scrollTop: 1200,
        selection: { from: 88, to: 88 }
      }
    },
    setNodeViewState: vi.fn()
  });

  expect(invoke).toHaveBeenCalledWith('save_reading_progress', {
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 1200,
        selectionFrom: 88,
        selectionTo: 88
      },
      {
        nodeId: 'node-2',
        scrollTop: 5400,
        selectionFrom: 48000,
        selectionTo: 48000
      }
    ],
    source: 'close-flush',
    updatedAt: expect.any(String)
  });
});

it('prefers the current visible position over a stale shared reading position outside immersive mode', async () => {
  const invoke = vi.fn(() => Promise.resolve(null));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);
  const setNodeViewState = vi.fn();

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(
      5400,
      { from: 0, to: 0 },
      {
        isPositionNearViewportRatio: () => false,
        primaryVisiblePosition: 3200
      }
    ),
    getReadingPositionSelection: () => ({ from: 12, to: 12 }),
    isImmersiveMode: false,
    isViewingTrashNode: false,
    nodeViewById: {},
    setNodeViewState
  });

  expect(setNodeViewState).toHaveBeenCalledWith('node-2', {
    scrollTop: 5400,
    selection: { from: 3200, to: 3200 }
  });
});
