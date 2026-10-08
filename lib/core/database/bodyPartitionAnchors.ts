import type { ImportBodySegment } from '../import/importBodySegments.js';

import { parseStoredAnchorLink } from './anchorLinkCodec.js';

function textRanges(value: string) {
  const anchor = parseStoredAnchorLink(value);
  if (!anchor) throw new Error('body_partition_invalid_anchor');
  const locator = anchor.locator;
  if (!locator || anchor.kind === 'image-excerpt') return [];
  if ('ranges' in locator) return locator.ranges;
  if ('from' in locator && 'to' in locator && typeof locator.from === 'number' && typeof locator.to === 'number') {
    return [{ from: locator.from, to: locator.to }];
  }
  return [];
}

export function bodyAnchorRanges(value: string) {
  return textRanges(value);
}

export function offsetBodyAnchor(value: string, offset: number) {
  const parsed: unknown = JSON.parse(value);
  const anchor = parseStoredAnchorLink(value);
  if (!anchor || !parsed || typeof parsed !== 'object') throw new Error('body_partition_invalid_anchor');
  if (!anchor.locator || !textRanges(value).length) return value;
  const locator = anchor.locator;
  if ('ranges' in locator) {
    return JSON.stringify({ ...parsed, locator: { ranges: locator.ranges.map((range) => ({
      ...range, from: range.from + offset, to: range.to + offset
    })) } });
  }
  if ('from' in locator && 'to' in locator && typeof locator.from === 'number' && typeof locator.to === 'number') {
    return JSON.stringify({ ...parsed, locator: { ...locator, from: locator.from + offset, to: locator.to + offset } });
  }
  return value;
}

export function anchorBodyPartIndex(value: string, parts: ImportBodySegment[]) {
  const ranges = textRanges(value);
  if (!ranges.length) return null;
  const index = parts.findIndex((part) => ranges.every((range) => range.from >= part.from && range.to <= part.to));
  if (index < 0) throw new Error('body_partition_cross_part_anchor');
  return index;
}
