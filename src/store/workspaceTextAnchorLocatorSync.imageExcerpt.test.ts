import { afterEach, beforeEach, expect, it } from 'vitest';

import type { Node } from '../features/nodes/model/nodeTypes';
import {
  createTestAttachmentResource,
  registerTestAttachmentResource,
  resetTestAttachmentResources
} from '../test/attachmentResourceTestSupport';

import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

const IMAGE_ATTACHMENT_ID = 'hash-1';
const { assetUrl: IMAGE_ASSET_URL } = createTestAttachmentResource({ attachmentId: IMAGE_ATTACHMENT_ID });
const image = `![Cover](${IMAGE_ASSET_URL})`;

beforeEach(() => {
  registerTestAttachmentResource({ attachmentId: IMAGE_ATTACHMENT_ID });
});

afterEach(() => {
  resetTestAttachmentResources();
});

function createChild(kind: 'highlight' | 'image-excerpt', imageRegions: NonNullable<Node['imageRegions']> | null): Node {
  return {
    anchorLink: { id: `${kind}-1`, kind, locator: { from: 0, originalText: image, to: image.length } },
    content: image,
    createdAt: '2026-04-14T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id: 'child-1',
    imageRegions,
    kind: 'topic',
    parentNodeId: 'parent-1',
    reveal: null,
    review: null,
    title: 'Child',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

function syncChild(child: Node) {
  return syncTextAnchorLocatorsForParentContent({
    nextContent: `Lead\n${image}`,
    nodesById: { 'child-1': child },
    parentNodeId: 'parent-1',
    previousContent: image,
    timestamp: '2026-04-14T01:00:00.000Z'
  }).updatedNodes[0];
}

it('relocates an image excerpt locator while preserving every local image-region field', () => {
  const imageRegions = [{
    attachmentId: IMAGE_ATTACHMENT_ID,
    regions: [{ height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.4 }]
  }];
  const updated = syncChild(createChild('image-excerpt', imageRegions));

  expect(updated?.anchorLink?.locator).toEqual({ from: 5, originalText: image, to: 5 + image.length });
  expect(updated?.imageRegions).toEqual(imageRegions);
});

it('continues deriving a full-image region for an ordinary image highlight', () => {
  expect(syncChild(createChild('highlight', null))?.imageRegions).toEqual([{
    attachmentId: IMAGE_ATTACHMENT_ID,
    regions: [{ height: 1, id: 'highlight-1-image-0', width: 1, x: 0, y: 0 }]
  }]);
});
