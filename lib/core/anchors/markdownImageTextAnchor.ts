import { parseAssetMarkdownUrl } from '../../platform/assetMarkdownUrl.js';
import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
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

type MarkdownImageReference = ReturnType<typeof collectMarkdownImageReferences>[number];

function readSegmentCore(content: string, from: number, to: number, trimStart: boolean, trimEnd: boolean) {
  const segment = content.slice(from, to);
  const leadingLength = trimStart ? segment.match(/^\s*/u)?.[0].length ?? 0 : 0;
  const trailingLength = trimEnd ? segment.match(/\s*$/u)?.[0].length ?? 0 : 0;
  const coreFrom = from + leadingLength;
  const coreTo = Math.max(coreFrom, to - trailingLength);
  return { from: coreFrom, text: content.slice(coreFrom, coreTo), to: coreTo };
}

function readMarkdownImageSegmentCore(
  content: string,
  images: MarkdownImageReference[],
  segmentIndex: number
) {
  const from = segmentIndex === 0 ? 0 : images[segmentIndex - 1]!.end;
  const to = segmentIndex === images.length ? content.length : images[segmentIndex]!.start;
  return readSegmentCore(content, from, to, segmentIndex > 0, segmentIndex < images.length);
}

function hasAlignedMarkdownImageSkeleton(
  previousContent: string,
  content: string,
  previousImages: MarkdownImageReference[],
  images: MarkdownImageReference[]
) {
  if (previousImages.length === 0 || previousImages.length !== images.length) return false;
  for (let index = 0; index <= previousImages.length; index += 1) {
    const previousCore = readMarkdownImageSegmentCore(previousContent, previousImages, index);
    const core = readMarkdownImageSegmentCore(content, images, index);
    if (previousCore.text !== core.text) return false;
  }
  return true;
}

function mapPositionThroughMarkdownImages(
  position: number,
  side: 'left' | 'right',
  previousContent: string,
  content: string,
  previousImages: MarkdownImageReference[],
  images: MarkdownImageReference[]
) {
  for (let index = 0; index < previousImages.length; index += 1) {
    const previousImage = previousImages[index]!;
    const image = images[index]!;
    if (position < previousImage.start) break;
    if (position === previousImage.start) return image.start;
    if (position < previousImage.end) return side === 'left' ? image.start : image.end;
    if (position === previousImage.end) return image.end;
  }
  const segmentIndex = previousImages.findIndex((image) => position < image.start);
  const resolvedIndex = segmentIndex >= 0 ? segmentIndex : previousImages.length;
  const previousCore = readMarkdownImageSegmentCore(previousContent, previousImages, resolvedIndex);
  const core = readMarkdownImageSegmentCore(content, images, resolvedIndex);
  const segmentFrom = resolvedIndex === 0 ? 0 : images[resolvedIndex - 1]!.end;
  const segmentTo = resolvedIndex === images.length ? content.length : images[resolvedIndex]!.start;
  if (position < previousCore.from) return side === 'left' ? segmentFrom : core.from;
  if (position > previousCore.to) return side === 'left' ? core.to : segmentTo;
  return core.from + (position - previousCore.from);
}

function remapThroughAlignedMarkdownImages(
  content: string,
  previousContent: string,
  locator: TextAnchorLocator
) {
  if (previousContent.slice(locator.from, locator.to) !== locator.originalText) return null;
  const previousImages = collectMarkdownImageReferences(previousContent);
  const images = collectMarkdownImageReferences(content);
  if (!hasAlignedMarkdownImageSkeleton(previousContent, content, previousImages, images)) return null;
  const from = mapPositionThroughMarkdownImages(
    locator.from, 'left', previousContent, content, previousImages, images
  );
  const to = mapPositionThroughMarkdownImages(
    locator.to, 'right', previousContent, content, previousImages, images
  );
  return { from, originalText: content.slice(from, to), to };
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
  previousLocator: TextAnchorLocator,
  previousContent?: string
): TextAnchorLocator {
  const previousLocatorImages = collectMarkdownImageReferences(previousLocator.originalText);
  if (previousLocatorImages.length === 0) return remappedLocator;
  const alignedRemap = previousContent
    ? remapThroughAlignedMarkdownImages(content, previousContent, previousLocator)
    : null;
  if (alignedRemap) return alignedRemap;
  const [onlyImage] = previousLocatorImages;
  if (previousLocatorImages.length !== 1 || onlyImage?.start !== 0 || onlyImage.end !== previousLocator.originalText.length) {
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
      const storageKey = target ? parseAssetMarkdownUrl(target.destination) : null;
      const attachmentId = storageKey
        ? parseCanonicalAttachmentStorageKey(storageKey)?.contentHash ?? null
        : null;
      if (!attachmentId) {
        return;
      }
      appendFullImageRegion(groups, attachmentId, `${input.anchorId}-image-${imageIndex}`);
      imageIndex += 1;
    });
  });

  return groups.length > 0 ? groups : null;
}
