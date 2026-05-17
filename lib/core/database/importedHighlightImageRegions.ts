import { parseAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../import/markdownImageReferences.js';

import type { StoredImageRegionGroup } from './imageRegionCodec.js';

interface TextLocatorRange {
  from: number;
  to: number;
}

function appendFullImageRegion(
  groups: StoredImageRegionGroup[],
  attachmentId: string,
  regionId: string
) {
  const existingGroup = groups.find((group) => group.attachmentId === attachmentId);
  const region = {
    height: 1,
    id: regionId,
    width: 1,
    x: 0,
    y: 0
  };
  if (existingGroup) {
    existingGroup.regions.push(region);
    return;
  }
  groups.push({ attachmentId, regions: [region] });
}

export function deriveImportedHighlightImageRegions(input: {
  anchorId: string;
  content: string;
  locators: TextLocatorRange[];
}) {
  const groups: StoredImageRegionGroup[] = [];
  let imageIndex = 0;

  input.locators.forEach((locator) => {
    const from = Math.max(0, Math.min(locator.from, input.content.length));
    const to = Math.max(from, Math.min(locator.to, input.content.length));
    collectMarkdownImageReferences(input.content.slice(from, to)).forEach((image) => {
      const target = parseMarkdownImageTarget(image.rawTarget);
      const attachmentId = target ? parseAssetMarkdownUrl(target.destination) : null;
      if (!attachmentId) {
        return;
      }
      appendFullImageRegion(groups, attachmentId, `${input.anchorId}-image-${imageIndex}`);
      imageIndex += 1;
    });
  });

  return groups.length > 0 ? groups : null;
}
