import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import {
  requestWorkspaceNodeDocumentPreload,
  resetWorkspaceNodeDocumentPrefetchForTest
} from './workspaceNodeDocumentPrefetch';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function seedReviewQueueWorkspaceState() {
  const initial = createInitialWorkspaceState(new Date('2026-05-18T00:00:00.000Z'));
  const seedNode = initial.nodesById['node-1']!;
  useWorkspaceStore.setState({
    ...initial,
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      'node-1': { ...seedNode, id: 'node-1', title: 'Node 1', content: 'Loaded node 1 body', hasContent: true, reveal: null, hasReveal: false },
      'node-2': { ...seedNode, id: 'node-2', title: 'Node 2', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-3': { ...seedNode, id: 'node-3', title: 'Node 3', content: '', hasContent: true, reveal: null, hasReveal: false },
      'node-4': { ...seedNode, id: 'node-4', title: 'Node 4', content: '', hasContent: true, reveal: null, hasReveal: false }
    },
    reviewSession: {
      currentNodeId: 'node-1',
      isAnswerRevealed: false,
      queueNodeIds: ['node-1', 'node-3', 'node-4'],
      totalNodeCount: 3
    },
    trashedNodeIds: []
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentPrefetchForTest();
  seedReviewQueueWorkspaceState();
});

it('retires the oldest pending strong-intent request when the two-item queue is full', async () => {
  const invoke = vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command !== 'load_node_document' || !payload?.nodeId) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      content: `Loaded ${payload.nodeId} body`,
      hideTitleHeading: false,
      kind: 'topic',
      reveal: null,
      virtualFilter: null
    });
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  requestWorkspaceNodeDocumentPreload(['node-2', 'node-3', 'node-4']);

  await vi.waitFor(() => {
    expect(invoke.mock.calls.map(([, payload]) => payload?.nodeId)).toEqual(['node-3', 'node-4']);
  });
  expect(useWorkspaceStore.getState().nodesById['node-3']!).toMatchObject({ content: '' });
  expect(useWorkspaceStore.getState().nodesById['node-4']!).toMatchObject({ content: '' });
});

it('continues with the next strong-intent request after a prefetch failure', async () => {
  const invoke = vi.fn().mockImplementation((_command: string, payload?: { nodeId?: string }) => {
    if (payload?.nodeId === 'node-2') {
      return Promise.reject(new Error('controlled prefetch failure'));
    }
    return Promise.resolve({
      content: `Loaded ${payload?.nodeId} body`,
      hideTitleHeading: false,
      kind: 'topic',
      reveal: null,
      virtualFilter: null
    });
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  requestWorkspaceNodeDocumentPreload(['node-2', 'node-3']);

  await vi.waitFor(() => {
    expect(invoke.mock.calls.map(([, payload]) => payload?.nodeId)).toEqual(['node-2', 'node-3']);
  });
});
