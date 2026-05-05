import { beforeEach, expect, it, vi } from 'vitest';

const { openWorkspaceNodeWithPreparedDocument } = vi.hoisted(() => ({
  openWorkspaceNodeWithPreparedDocument: vi.fn()
}));

vi.mock('../../store/workspaceNodePreparation', () => ({
  openWorkspaceNodeWithPreparedDocument
}));

import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { installWorkspaceDebugBridge } from './workspaceDebugBridge';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z')));
  delete (window as Window & { __folioleWorkspaceDebug?: unknown }).__folioleWorkspaceDebug;
});

it('opens debug nodes through the prepared open path', async () => {
  installWorkspaceDebugBridge();
  const debugApi = (window as Window & {
    __folioleWorkspaceDebug?: { openNode: (nodeId: string) => Promise<boolean> };
  }).__folioleWorkspaceDebug;

  const opened = await debugApi?.openNode('node-1');

  expect(opened).toBe(true);
  expect(openWorkspaceNodeWithPreparedDocument).toHaveBeenCalledWith('node-1');
});

it('reads active node id and saved node view state through the debug bridge', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'node-2',
    nodeViewById: {
      ...state.nodeViewById,
      'node-2': {
        scrollTop: 5400,
        selection: { from: 48000, to: 48024 }
      }
    }
  }));

  installWorkspaceDebugBridge();
  const debugApi = (window as Window & {
    __folioleWorkspaceDebug?: {
      getActiveNodeId: () => string | null;
      getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } } | null;
    };
  }).__folioleWorkspaceDebug;

  expect(debugApi?.getActiveNodeId()).toBe('node-2');
  expect(debugApi?.getNodeViewState('node-2')).toEqual({
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 }
  });
  expect(debugApi?.getNodeViewState('missing-node')).toBeNull();
});
