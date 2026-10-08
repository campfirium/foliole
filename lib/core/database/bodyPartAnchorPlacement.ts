import type { ImportBodySegment } from '../import/importBodySegments.js';
import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../nodes/textBodyBudget.js';

import { bodyAnchorRanges } from './bodyPartitionAnchors.js';

/** Prefer one complete anchor span when it fits, otherwise preserve the source-owned anchor. */
export function protectedBodyPartAnchorSpans(text: string, anchorLinks: readonly string[]) {
  return anchorLinks.flatMap(anchorLink => {
    const ranges = bodyAnchorRanges(anchorLink);
    if (!ranges.length) return [];
    const span = ranges.reduce((span, range) => ({ from: Math.min(span.from, range.from),
      to: Math.max(span.to, range.to) }), { from: text.length, to: 0 });
    if (span.from < 0 || span.to > text.length) throw new Error('body_partition_anchor_range_invalid');
    return utf8ByteLength(text.slice(span.from, span.to)) <= TEXT_BODY_MAX_BYTES ? [span] : [];
  });
}

export function fittingBodyPartAnchorIndex(anchorLink: string, parts: readonly ImportBodySegment[]) {
  const ranges = bodyAnchorRanges(anchorLink);
  return ranges.length ? parts.findIndex(part => ranges.every(range => range.from >= part.from && range.to <= part.to)) : -1;
}
