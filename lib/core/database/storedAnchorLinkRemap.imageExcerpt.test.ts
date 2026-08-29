import { expect, it } from 'vitest';

import { remapStoredTextAnchorLink } from './storedAnchorLinkRemap.js';

it('preserves local regions for image excerpts while remapping only their text locator', () => {
  const image = '![Cover](asset://hash-1.png)';
  const imageRegions = [{
    attachmentId: 'hash-1',
    regions: [{ height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.4 }]
  }];
  const result = remapStoredTextAnchorLink({
    anchorLink: {
      id: 'excerpt-1', kind: 'image-excerpt',
      locator: { from: 0, originalText: image, to: image.length }
    },
    imageRegions,
    nextContent: `Lead\n${image}`,
    previousContent: image
  });

  expect(result?.imageRegions).toEqual(imageRegions);
  expect(result?.anchorLink.locator).toMatchObject({ from: 5 });
});
