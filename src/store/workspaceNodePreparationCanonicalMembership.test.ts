import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import {
  ensureWorkspaceNodeDocumentReady,
  openWorkspaceNodeWithPreparedDocument
} from './workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  const initial = createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z'));
  const seedNode = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': {
        ...seedNode,
        content: 'Visible body',
        hasContent: true,
        id: 'node-1',
        title: 'Node 1'
      },
      'node-2': {
        ...seedNode,
        content: 'Deleted body',
        deletedAt: '2026-05-24T00:00:00.000Z',
        hasContent: true,
        id: 'node-2',
        title: 'Deleted node'
      }
    },
    trashedNodeIds: []
  });
});

it('does not apply a prepared open for a deleted node when trash projection is stale', async () => {
  const invoke = vi.fn();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await openWorkspaceNodeWithPreparedDocument('node-2');

  expect(invoke).not.toHaveBeenCalled();
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
});

it('allows explicit trash document preload without making the deleted node active', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content: 'Loaded deleted body',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    virtualFilter: null
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodesById: {
      ...state.nodesById,
      'node-2': {
        ...state.nodesById['node-2']!,
        content: '',
        hasContent: true
      }
    },
    trashedNodeIds: ['node-2']
  }));

  await ensureWorkspaceNodeDocumentReady('node-2', {
    includeTrashed: true,
    keepWarm: true
  });

  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-2' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
  expect(useWorkspaceStore.getState().nodesById['node-2']).toMatchObject({
    content: 'Loaded deleted body'
  });
  expect(useWorkspaceStore.getState().rendererBoundaryKeepNodeIds).toContain('node-2');
});
