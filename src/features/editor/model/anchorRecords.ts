import { parseAnchorBlocks, stripAnchorBlocks, type AnchorKind } from './anchorBlocks.js';

export interface AnchorRecord {
  from: number;
  id: string;
  kind: AnchorKind;
  closeTagFrom: number;
  closeTagTo: number;
  openTagFrom: number;
  openTagTo: number;
  text: string;
  to: number;
}

export interface AnchorCoverageSegment {
  activeClozeCount: number;
  activeHighlightCount: number;
  from: number;
  to: number;
}

export interface AnchorDisplayPlan {
  clozeRanges: Array<{ from: number; to: number }>;
  highlightOverlapRanges: Array<{ from: number; to: number }>;
  highlightRanges: Array<{ from: number; to: number }>;
  mixedOverlapRanges: Array<{ from: number; to: number }>;
  tokenRanges: Array<{ from: number; to: number }>;
}

export interface AnchorRange {
  from: number;
  to: number;
}

export interface AnchorRangeChange {
  from: number;
  to: number;
}

export function createAnchorKey(anchor: { id: string; kind: AnchorKind }) {
  return `${anchor.kind}:${anchor.id}`;
}

function normalizeAnchorText(content: string) {
  return stripAnchorBlocks(content).replace(/\s+/g, ' ').trim();
}

function mergeAdjacentRanges(ranges: Array<{ from: number; to: number }>) {
  if (ranges.length === 0) return ranges;
  const merged: Array<{ from: number; to: number }> = [];
  let current = { ...ranges[0] };
  for (let index = 1; index < ranges.length; index += 1) {
    const next = ranges[index];
    if (next.from <= current.to) {
      current.to = Math.max(current.to, next.to);
      continue;
    }
    merged.push(current);
    current = { ...next };
  }
  merged.push(current);
  return merged;
}

function isAnchorTagGap(value: string) {
  if (!value.trim()) return true;
  return stripAnchorBlocks(value).trim().length === 0;
}

function mergeRangesAcrossAnchorTagGaps(content: string, ranges: Array<{ from: number; to: number }>) {
  if (ranges.length === 0) return ranges;
  const merged: Array<{ from: number; to: number }> = [];
  let current = { ...ranges[0] };

  for (let index = 1; index < ranges.length; index += 1) {
    const next = ranges[index];
    const canJoinByTouching = next.from <= current.to;
    const canJoinByHiddenTags = isAnchorTagGap(content.slice(current.to, next.from));
    if (canJoinByTouching || canJoinByHiddenTags) {
      current.to = Math.max(current.to, next.to);
      continue;
    }
    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

function collectMergedSegmentRanges(
  content: string,
  segments: ReadonlyArray<AnchorCoverageSegment>,
  predicate: (segment: Readonly<AnchorCoverageSegment>) => boolean
) {
  const picked: Array<{ from: number; to: number }> = [];
  for (const segment of segments) {
    if (!predicate(segment)) continue;
    picked.push({ from: segment.from, to: segment.to });
  }
  return mergeRangesAcrossAnchorTagGaps(content, picked);
}

export function collectAnchorRecords(content: string): AnchorRecord[] {
  return parseAnchorBlocks(content).blocks.map((block) => ({
    closeTagFrom: block.closeTagFrom,
    closeTagTo: block.closeTagTo,
    from: block.contentFrom,
    id: block.id,
    kind: block.kind,
    openTagFrom: block.openTagFrom,
    openTagTo: block.openTagTo,
    text: normalizeAnchorText(content.slice(block.contentFrom, block.contentTo)),
    to: block.contentTo
  }));
}

export function findAnchorRecord(
  content: string,
  anchor: { id: string; kind: AnchorKind }
): AnchorRecord | null {
  return collectAnchorRecords(content).find((record) => record.kind === anchor.kind && record.id === anchor.id) ?? null;
}

export function collectAnchorRecordsByKind(content: string, kind: AnchorKind): AnchorRecord[] {
  return collectAnchorRecords(content).filter((record) => record.kind === kind);
}

export function findOverlappingAnchorRecords(
  content: string,
  range: AnchorRange,
  kind?: AnchorKind
): AnchorRecord[] {
  return collectAnchorRecords(content).filter((record) => {
    if (kind && record.kind !== kind) {
      return false;
    }
    return range.from < record.to && range.to > record.from;
  });
}

export function getAnchorWrappedRange(record: AnchorRecord): AnchorRange {
  return {
    from: record.openTagFrom,
    to: record.closeTagTo
  };
}

export function getAnchorContentRange(record: AnchorRecord): AnchorRange {
  return {
    from: record.from,
    to: record.to
  };
}

export function unwrapAnchorRecord(content: string, record: AnchorRecord): string {
  return `${content.slice(0, record.openTagFrom)}${content.slice(record.from, record.to)}${content.slice(record.closeTagTo)}`;
}

export function collectAnchorProtectedRanges(content: string): AnchorRange[] {
  return collectAnchorTokenRanges(content).sort((left, right) => left.from - right.from);
}

export function doesRangeTouchRange(change: AnchorRangeChange, range: AnchorRange): boolean {
  const isInsertion = change.from === change.to;
  if (isInsertion) {
    return change.from > range.from && change.from < range.to;
  }
  return change.from < range.to && change.to > range.from;
}

export function doesRangeTouchAnchorProtectedRange(change: AnchorRangeChange, protectedRange: AnchorRange): boolean {
  return doesRangeTouchRange(change, protectedRange);
}

export function doesChangeTouchAnchorProtectedRanges(
  changes: ReadonlyArray<AnchorRangeChange>,
  protectedRanges: ReadonlyArray<AnchorRange>
): boolean {
  if (changes.length === 0 || protectedRanges.length === 0) {
    return false;
  }
  return changes.some((change) =>
    protectedRanges.some((protectedRange) => doesRangeTouchAnchorProtectedRange(change, protectedRange))
  );
}

export function collectAnchorTokenRanges(content: string): Array<{ from: number; to: number }> {
  const parsed = parseAnchorBlocks(content);
  const tagRanges = parsed.blocks.flatMap((block) => [
    { from: block.openTagFrom, to: block.openTagTo },
    { from: block.closeTagFrom, to: block.closeTagTo }
  ]);
  const invalidRanges = parsed.invalidTokens.map((token) => ({ from: token.from, to: token.to }));
  return [...tagRanges, ...invalidRanges].sort((left, right) => left.from - right.from);
}

export function collectAnchorTagTokens(content: string) {
  return collectAnchorRecords(content).flatMap((record) => ([
    { from: record.openTagFrom, id: record.id, kind: record.kind, slash: false as const, to: record.openTagTo },
    { from: record.closeTagFrom, id: record.id, kind: record.kind, slash: true as const, to: record.closeTagTo }
  ]));
}

export function collectAnchorCoverageSegments(
  content: string,
  hiddenAnchorKeys: ReadonlySet<string> = new Set()
): AnchorCoverageSegment[] {
  const records = collectAnchorRecords(content);
  const tokenRanges = collectAnchorTokenRanges(content);
  const boundaries = new Set<number>([0, content.length]);

  for (const record of records) {
    boundaries.add(record.from);
    boundaries.add(record.to);
  }
  for (const range of tokenRanges) {
    boundaries.add(range.from);
    boundaries.add(range.to);
  }

  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: AnchorCoverageSegment[] = [];
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const from = orderedBoundaries[index];
    const to = orderedBoundaries[index + 1];
    if (to <= from) {
      continue;
    }
    if (tokenRanges.some((range) => range.from <= from && range.to >= to)) {
      continue;
    }
    const visibleRecords = records.filter((record) => {
      if (hiddenAnchorKeys.has(createAnchorKey(record))) {
        return false;
      }
      return record.from < to && record.to > from;
    });
    segments.push({
      activeClozeCount: visibleRecords.filter((record) => record.kind === 'cloze').length,
      activeHighlightCount: visibleRecords.filter((record) => record.kind === 'highlight').length,
      from,
      to
    });
  }
  return segments;
}

export function buildAnchorDisplayPlan(
  content: string,
  hiddenAnchorKeys: ReadonlySet<string> = new Set()
): AnchorDisplayPlan {
  const segments = collectAnchorCoverageSegments(content, hiddenAnchorKeys);
  return {
    clozeRanges: collectMergedSegmentRanges(content, segments, (segment) => segment.activeClozeCount > 0),
    highlightOverlapRanges: collectMergedSegmentRanges(content, segments, (segment) => segment.activeHighlightCount > 1),
    highlightRanges: collectMergedSegmentRanges(content, segments, (segment) => segment.activeHighlightCount > 0),
    mixedOverlapRanges: collectMergedSegmentRanges(
      content,
      segments,
      (segment) => segment.activeHighlightCount + segment.activeClozeCount > 1 && segment.activeHighlightCount <= 1
    ),
    tokenRanges: mergeAdjacentRanges(collectAnchorTokenRanges(content))
  };
}
