import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from './workspaceStore';

const nodeStorage = vi.hoisted(() => ({
  listNodeOrder: vi.fn<() => Promise<string[]>>(),
  loadNodes: vi.fn(),
  saveNode: vi.fn(),
  saveNodeOrder: vi.fn()
}));
const runtimeInvoke = vi.hoisted(() => vi.fn());

vi.mock('../../lib/platform/storage', () => ({
  nodeStorage
}));

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn(() => runtimeInvoke)
}));

beforeEach(() => {
  runtimeInvoke.mockReset();
  runtimeInvoke.mockImplementation(async (command: string) => {
    if (command === 'create_item') {
      return null;
    }
    if (command === 'update_node_content') {
      return null;
    }
    return null;
  });
  useWorkspaceStore.persist.clearStorage();
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        anchorLink: null,
        content: '# Parent',
        createdAt: '2026-03-25T10:00:00.000Z',
        hasContent: true,
        hasReveal: false,
        id: 'node-1',
        kind: 'topic',
        parentNodeId: null,
        reveal: null,
        review: null,
        title: 'Parent',
        updatedAt: '2026-03-25T10:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  });
});

it('keeps image cloze nodes local when creation mutation returns no patch', async () => {
  const createdIds = await useWorkspaceStore.getState().createImageClozeNodes(
    'node-1',
    'hash-1',
    {
      promptContent: 'Before image\n\n![Cover](asset://hash-1.png)\n\nAfter image',
      revealContent: '![Cover](asset://hash-1.png)'
    },
    [{
      answer: 'Paris',
      attachmentId: 'hash-1',
      height: 0.15,
      id: 'region-1',
      width: 0.2,
      x: 0.1,
      y: 0.2
    }]
  );
  const createdId = createdIds[0] as string;
  const createdNode = useWorkspaceStore.getState().nodesById[createdId];

  expect(createdIds).toHaveLength(1);
  expect(createdNode?.hasContent).toBe(true);
  expect(createdNode?.hasReveal).toBe(true);
  expect(createdNode?.anchorLink?.id).toBe('region-1');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions).toEqual([{
    attachmentId: 'hash-1',
    regions: [{ height: 0.15, id: 'region-1', width: 0.2, x: 0.1, y: 0.2 }]
  }]);
});
