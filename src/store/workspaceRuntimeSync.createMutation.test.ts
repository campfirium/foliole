import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { hasPendingNodeSync, mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import { syncCreateNodeMutationToRuntime } from './workspaceRuntimeSync';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createNodeFixture(): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    priority: 0,
    desiredRetention: 0.81,
    enableShortTerm: null,
    sequentialReadingEnabled: null,
    shelvedAt: null,
    manualChildOrder: null,
    title: 'Seed',
    isTitleManual: false,
    hideTitleHeading: true,
    content: '# Seed',
    anchorLink: null,
    imageRegions: null,
    reveal: 'Reveal',
    reading: null,
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('clears pending node sync after a create mutation is confirmed', async () => {
  const invoke = vi.fn().mockResolvedValue({
    activeNodeId: 'node-1',
    createdNodeIds: ['node-1'],
    nodeOrder: ['node-1'],
    nodes: [{
      nodeId: 'node-1',
      parentNodeId: null,
      kind: 'topic',
      title: 'Seed',
      isTitleManual: false,
      content: '# Seed',
      reveal: 'Reveal',
      anchorLink: null,
      imageRegions: null,
      position: 0,
      createdAt: '2026-03-06T00:00:00.000Z',
      updatedAt: '2026-03-06T00:00:01.000Z'
    }]
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await syncCreateNodeMutationToRuntime(createNodeFixture(), ['node-1'], 'node-1', 0);

  expect(hasPendingNodeSync('node-1')).toBe(false);
});

it('keeps failed create mutations in pending node sync for hydrate replay', async () => {
  const invoke = vi.fn().mockRejectedValue(new Error('create failed'));
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(syncCreateNodeMutationToRuntime(createNodeFixture(), ['node-1'], 'node-1', 0)).resolves.toBeNull();

  expect(hasPendingNodeSync('node-1')).toBe(true);
  expect(mergePendingNodeSyncIntoSnapshot({
    activeNodeId: null,
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: []
  })?.nodesById['node-1']?.content).toBe('# Seed');
});
