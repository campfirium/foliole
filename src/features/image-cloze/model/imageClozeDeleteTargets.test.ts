import { expect, it } from 'vitest';

import type { ImageClozeNodeSource } from './imageCloze';
import { findLiveImageClozeChildNodeIds } from './imageClozeDeleteTargets';

it('uses stable mask identity for modern Items even when another Item has the same rectangle', () => {
  const rect = { x: 0.2, y: 0.3, width: 0.3, height: 0.2 };
  const make = (id: string, regionId: string): ImageClozeNodeSource => ({ id, parentNodeId: 'parent',
    anchorLink: { kind: 'cloze', id: regionId, locator: { attachmentId: 'image', ...rect } },
    imageRegions: [{ attachmentId: 'image', regions: [{ id: regionId, ...rect }] }] });
  const selected = make('selected', 'region-one');
  const other = make('other', 'region-two');
  const parent: ImageClozeNodeSource = { id: 'parent', parentNodeId: null, imageRegions: selected.imageRegions ?? null };
  expect(findLiveImageClozeChildNodeIds({ nodesById: { parent, selected, other }, trashedNodeIds: [] }, 'parent', 'image', 'region-one')).toEqual(['selected']);
});
