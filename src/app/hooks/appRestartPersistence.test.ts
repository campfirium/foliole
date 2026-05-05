import type { MutableRefObject } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import { restartAppWithReadingProgress } from './appRestartPersistence';

const mocks = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn(),
  restartMainWindowApp: vi.fn(() => Promise.resolve()),
  logRuntimeWarning: vi.fn()
}));

vi.mock('../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: mocks.getRuntimeInvoke
}));

vi.mock('../../shared/platform/windowControls', () => ({
  restartMainWindowApp: mocks.restartMainWindowApp
}));

vi.mock('../../shared/platform/runtimeLogging', () => ({
  logRuntimeWarning: mocks.logRuntimeWarning
}));

function createEditorRef(scrollTop = 5400, selection = { from: 12, to: 18 }) {
  return {
    current: {
      getScrollTop: () => scrollTop,
      getSelection: () => selection
    }
  } as unknown as MutableRefObject<EditorAdapter | null>;
}

beforeEach(() => {
  mocks.getRuntimeInvoke.mockReset();
  mocks.restartMainWindowApp.mockClear();
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
    updatedAt: expect.any(String)
  });
  expect(mocks.restartMainWindowApp).toHaveBeenCalledTimes(1);
});

it('still restarts when the flush fails', async () => {
  const invoke = vi.fn(() => Promise.reject(new Error('save failed')));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(),
    getReadingPositionSelection: () => ({ from: 48000, to: 48000 }),
    isViewingTrashNode: false,
    nodeViewById: {},
    setNodeViewState: vi.fn()
  });

  expect(mocks.logRuntimeWarning).toHaveBeenCalled();
  expect(mocks.restartMainWindowApp).toHaveBeenCalledTimes(1);
});

it('normalizes scroll and selection before flushing on restart', async () => {
  const invoke = vi.fn(() => Promise.resolve(null));
  mocks.getRuntimeInvoke.mockReturnValue(invoke);

  await restartAppWithReadingProgress({
    activeNodeId: 'node-2',
    editorRef: createEditorRef(465.5, { from: 542.9, to: 542.9 }),
    getReadingPositionSelection: () => ({ from: 542.9, to: 542.9 }),
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
    updatedAt: expect.any(String)
  });
});
