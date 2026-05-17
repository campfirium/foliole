import { parseAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { collectMarkdownImageReferences, parseMarkdownImageTarget } from '../import/markdownImageReferences.js';

import type { TextAnchorLocator } from './textAnchorLocator.js';

export interface MarkdownImageAnchorRegion {
  id: string;
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface MarkdownImageAnchorRegionGroup {
  attachmentId: string;
  regions: MarkdownImageAnchorRegion[];
}

function appendFullImageRegion(
  groups: MarkdownImageAnchorRegionGroup[],
  attachmentId: string,
  regionId: string
) {
  const region = { height: 1, id: regionId, width: 1, x: 0, y: 0 };
  const existingGroup = groups.find((group) => group.attachmentId === attachmentId);
  if (existingGroup) {
    existingGroup.regions.push(region);
    return;
  }
  groups.push({ attachmentId, regions: [region] });
}

export function expandMarkdownImageTextLocator(
  content: string,
  remappedLocator: TextAnchorLocator,
  previousLocator: TextAnchorLocator
): TextAnchorLocator {
  if (collectMarkdownImageReferences(previousLocator.originalText).length === 0) {
    return remappedLocator;
  }
  const searchStart = content.lastIndexOf('\n', Math.max(0, remappedLocator.from - 1)) + 1;
  const searchEndIndex = content.indexOf('\n', remappedLocator.to);
  const searchEnd = searchEndIndex >= 0 ? searchEndIndex : content.length;
  const searchText = content.slice(searchStart, searchEnd);
  const image = collectMarkdownImageReferences(searchText).find((reference) => {
    const from = searchStart + reference.start;
    const to = searchStart + reference.end;
    return from <= remappedLocator.to && to >= remappedLocator.from;
  });
  if (!image) {
    return remappedLocator;
  }
  return {
    from: searchStart + image.start,
    originalText: image.fullMatch,
    to: searchStart + image.end
  };
}

export function deriveMarkdownImageTextAnchorRegions(input: {
  anchorId: string;
  content: string;
  locators: Array<Pick<TextAnchorLocator, 'from' | 'to'>>;
}) {
  const groups: MarkdownImageAnchorRegionGroup[] = [];
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
