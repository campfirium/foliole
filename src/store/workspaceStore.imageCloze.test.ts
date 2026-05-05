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
];

function createImageClozeNodes() {
  return useWorkspaceStore.getState().createImageClozeNodes('node-1', 'hash-1', IMAGE_CLOZE_SOURCE, [...IMAGE_CLOZE_REGIONS]);
}

function createSingleImageClozeNode(region: (typeof IMAGE_CLOZE_REGIONS)[number]) {
  return useWorkspaceStore.getState().createImageClozeNodes('node-1', 'hash-1', IMAGE_CLOZE_SOURCE, [{ ...region }]);
}

function createThirdImageClozeRegion() {
  return {
    answer: 'Bridge',
    attachmentId: 'hash-1',
    height: 0.1,
    id: 'region-3',
    width: 0.16,
    x: 0.62,
    y: 0.18
  };
}

function seedLegacyMismatchedImageClozeChild() {
  useWorkspaceStore.setState((state) => ({
    nodeOrder: [...state.nodeOrder, 'node-legacy'],
    nodesById: {
      ...state.nodesById,
      'node-1': {
        ...state.nodesById['node-1'],
        imageRegions: [
          {
            attachmentId: 'hash-1',
            regions: [{ id: 'region-legacy-ui', height: 0.15, width: 0.2, x: 0.1, y: 0.2 }]
          }
        ]
      },
      'node-legacy': {
        ...state.nodesById['node-1'],
        id: 'node-legacy',
        kind: 'item',
        parentNodeId: 'node-1',
        content: IMAGE_CLOZE_SOURCE.promptContent,
        hasReveal: true,
        reveal: IMAGE_CLOZE_SOURCE.revealContent,
        anchorLink: {
          id: 'legacy-child-id',
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            height: 0.15,
            width: 0.2,
            x: 0.1,
            y: 0.2
          }
        }
      }
    }
  }));
}

function expectCreatedImageClozeNodes(createdIds: string[]) {
  const firstNode = useWorkspaceStore.getState().nodesById[createdIds[0] as string];
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
  expect(firstNode?.imageRegions).toEqual([
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

  expect(createdIds).toHaveLength(1);
  expectCreatedImageClozeNodes(createdIds as string[]);
});

it('removes the topic image region when the linked image cloze item is deleted and restores it from the child node', () => {
  const [createdId] = createImageClozeNodes();
  expect(createdId).toBeTruthy();

  useWorkspaceStore.getState().deleteNode(createdId as string);

  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions).toBeNull();

  useWorkspaceStore.getState().restoreNode(createdId as string);

  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain(createdId as string);
});

it('soft deletes the linked image cloze item when deleting the region from the image surface', () => {
  const [createdId] = createImageClozeNodes();
  expect(createdId).toBeTruthy();

  useWorkspaceStore.getState().deleteImageClozeRegion('node-1', 'hash-1', 'region-1');

  expect(useWorkspaceStore.getState().trashedNodeIds).toContain(createdId as string);
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions).toBeNull();
});

it('does not resurrect a deleted image region when a new one is created later', () => {
  const [firstId] = createSingleImageClozeNode(IMAGE_CLOZE_REGIONS[0]);
  const [secondId] = createSingleImageClozeNode(IMAGE_CLOZE_REGIONS[1]);
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();

  useWorkspaceStore.getState().deleteNode(firstId as string);

  const [thirdId] = createSingleImageClozeNode({
    answer: 'Bridge',
    attachmentId: 'hash-1',
    height: 0.1,
    id: 'region-3',
    width: 0.16,
    x: 0.62,
    y: 0.18
  });

  expect(thirdId).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions).toEqual([
    {
      attachmentId: 'hash-1',
      regions: [
        {
          height: 0.12,
          id: 'region-2',
          width: 0.18,
          x: 0.42,
          y: 0.55
        },
        {
          height: 0.1,
          id: 'region-3',
          width: 0.16,
          x: 0.62,
          y: 0.18
        }
      ]
    }
  ]);
});

it('deletes a legacy child with matching region shape even when the child id differs from the region id', () => {
  seedLegacyMismatchedImageClozeChild();
  useWorkspaceStore.getState().deleteImageClozeRegion('node-1', 'hash-1', 'region-legacy-ui');
  createSingleImageClozeNode(createThirdImageClozeRegion());

  expect(useWorkspaceStore.getState().trashedNodeIds).toContain('node-legacy');
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions).toEqual([
    {
      attachmentId: 'hash-1',
      regions: [
        {
          height: 0.1,
          id: 'region-3',
          width: 0.16,
          x: 0.62,
          y: 0.18
        }
      ]
    }
  ]);
});
