import { collectAnchorProtectedRanges } from './anchorRecords';

interface TextRange {
  from: number;
  to: number;
}

function collectSortedTokenRanges(content: string): TextRange[] {
  return collectAnchorProtectedRanges(content);
}

export function mapRawPositionToVisibleOffset(content: string, position: number) {
  const protectedRanges = collectSortedTokenRanges(content);
  let rawCursor = 0;
  let visibleCursor = 0;

  for (const range of protectedRanges) {
    if (position <= range.from) {
      return visibleCursor + (position - rawCursor);
    }
    if (position < range.to) {
      return visibleCursor + (range.from - rawCursor);
    }
    visibleCursor += range.from - rawCursor;
    rawCursor = range.to;
  }

  return visibleCursor + (position - rawCursor);
}

export function mapVisibleOffsetToRawPosition(content: string, position: number) {
  const protectedRanges = collectSortedTokenRanges(content);
  let rawCursor = 0;
  let visibleCursor = 0;

  for (const range of protectedRanges) {
    const visibleLength = range.from - rawCursor;
    if (position <= visibleCursor + visibleLength) {
      return rawCursor + (position - visibleCursor);
    }
    visibleCursor += visibleLength;
    rawCursor = range.to;
  }

  return rawCursor + (position - visibleCursor);
}
