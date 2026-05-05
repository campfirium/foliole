import { beforeEach, expect, it, vi } from 'vitest';

import { useWorkspaceStore } from './workspaceStore';

const nodeStorage = vi.hoisted(() => ({
  listNodeOrder: vi.fn<() => Promise<string[]>>(),
  loadNodes: vi.fn(),
  saveNode: vi.fn(),
  saveNodeOrder: vi.fn()
}));

vi.mock('../../lib/platform/storage', () => ({
  nodeStorage
}));

beforeEach(() => {
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

const IMAGE_CLOZE_SOURCE = {
  promptContent: 'Before image\n\n![Cover](asset://hash-1.png)\n\nAfter image',
  revealContent: '![Cover](asset://hash-1.png)'
};

const IMAGE_CLOZE_REGIONS = [
  {
    answer: 'Paris',
    attachmentId: 'hash-1',
    height: 0.15,
    id: 'region-1',
    width: 0.2,
    x: 0.1,
    y: 0.2
  },
  {
    answer: 'River',
    attachmentId: 'hash-1',
    height: 0.12,
    id: 'region-2',
    width: 0.18,
    x: 0.42,
    y: 0.55
  }
] as const;

function createImageClozeNodes() {
  return useWorkspaceStore.getState().createImageClozeNodes('node-1', 'hash-1', IMAGE_CLOZE_SOURCE, [...IMAGE_CLOZE_REGIONS]);
}

function expectCreatedImageClozeNodes(createdIds: string[]) {
  const firstNode = useWorkspaceStore.getState().nodesById[createdIds[0] as string];
  const secondNode = useWorkspaceStore.getState().nodesById[createdIds[1] as string];
  const parentNode = useWorkspaceStore.getState().nodesById['node-1'];

  expect(firstNode?.parentNodeId).toBe('node-1');
  expect(firstNode?.kind).toBe('item');
  expect(firstNode?.content).toBe('Before image\n\n![Cover](asset://hash-1.png)\n\nAfter image');
  expect(firstNode?.reveal).toBe('![Cover](asset://hash-1.png)');
  expect(firstNode?.review).not.toBeNull();
  expect(firstNode?.anchorLink?.kind).toBe('cloze');
  expect(firstNode?.anchorLink?.id).toBe('region-1');
  expect(firstNode?.title).toBe('Before image Cover After image');
  expect(firstNode?.anchorLink?.locator).toMatchObject({
    attachmentId: 'hash-1',
    height: 0.15,
    width: 0.2,
    x: 0.1,
    y: 0.2
  });
  expect(secondNode?.reveal).toBe('![Cover](asset://hash-1.png)');
  expect(parentNode?.imageRegions).toEqual([
    {
      attachmentId: 'hash-1',
      regions: [
        {
          height: 0.15,
          id: 'region-1',
          width: 0.2,
          x: 0.1,
          y: 0.2
        },
        {
          height: 0.12,
          id: 'region-2',
          width: 0.18,
          x: 0.42,
          y: 0.55
        }
      ]
    }
  ]);
}

it('creates image cloze item nodes with prompt context and reveal image content', () => {
  const createdIds = createImageClozeNodes();

  expect(createdIds).toHaveLength(2);
  expectCreatedImageClozeNodes(createdIds as string[]);
});
