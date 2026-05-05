import { expect, it } from 'vitest';

import { deriveImageClozeRegionsFromChildren } from './imageCloze';

const sourceNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'Source',
  parentNodeId: null,
  content: '![Cover](asset://hash-1.png)',
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

const directRegion = {
  id: 'region-2',
  height: 0.2,
  width: 0.3,
  x: 0.1,
  y: 0.2
};

const nestedRegion = {
  id: 'region-3',
  height: 0.18,
  width: 0.22,
  x: 0.32,
  y: 0.28
};

it('keeps only direct child image cloze regions for the source node', () => {
  const regions = deriveImageClozeRegionsFromChildren({
    nodeId: 'node-1',
    nodesById: {
      'node-1': sourceNode,
      'node-2': {
        ...sourceNode,
        id: 'node-2',
        kind: 'item',
        title: 'Direct child',
        parentNodeId: 'node-1',
        anchorLink: {
          id: directRegion.id,
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            ...directRegion
          }
        },
        imageRegions: [
          {
            attachmentId: 'hash-1',
            regions: [directRegion, nestedRegion]
          }
        ],
        reveal: 'Prompt'
      },
      'node-3': {
        ...sourceNode,
        id: 'node-3',
        kind: 'item',
        title: 'Grandchild',
        parentNodeId: 'node-2',
        anchorLink: {
          id: nestedRegion.id,
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            ...nestedRegion
          }
        },
        reveal: 'Nested'
      }
    }
  });

  expect(regions).toEqual([
    {
      attachmentId: 'hash-1',
      regions: [directRegion]
    }
  ]);
});
