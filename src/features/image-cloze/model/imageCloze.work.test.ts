import { expect, it } from 'vitest';

import type { Node } from '../../nodes/model/nodeTypes';

import { deriveImageClozeRegionsFromChildren } from './imageCloze';

it.each([100, 1000, 10000])('derives complete direct regions without a full parent scan for each child at %i nodes', (size) => {
  let parentReads = 0;
  const nodesById: Record<string, Node> = {};
  const region = { id: 'region', x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  for (let index = 0; index < size; index += 1) {
    const parentNodeId = index < 10 ? 'source' : 'other';
    nodesById[`node-${index}`] = {
      id: `node-${index}`, title: '', kind: 'topic', content: '', createdAt: '', updatedAt: '',
      reveal: '', review: null, anchorLink: null,
      imageRegions: index < 10 ? [{ attachmentId: 'asset', regions: [region] }] : null,
      get parentNodeId() { parentReads += 1; return parentNodeId; }
    };
  }
  expect(deriveImageClozeRegionsFromChildren({ nodeId: 'source', nodesById })).toEqual([
    { attachmentId: 'asset', regions: [region] }
  ]);
  // A bounded number of relationship passes, independent of direct child count.
  expect(parentReads).toBeLessThanOrEqual(4 * size);
});
