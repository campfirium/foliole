import { type EditorSelection } from '@codemirror/state';

import { parseAnchorBlocks, type AnchorKind } from '../model/anchorBlocks';

interface RawChange {
  from: number;
  insert: string;
  to: number;
}

interface ProtectedRange {
  from: number;
  to: number;
}

interface AnchorRange {
  closeOrder: number;
  end: number;
  id: string;
  kind: AnchorKind;
  openOrder: number;
  start: number;
}

interface AnchorMutationRecoveryInput {
  changes: RawChange[];
  content: string;
  nextContent: string;
  selection: EditorSelection;
}

interface AnchorMutationRecoveryResult {
  content: string;
  selection: { anchor: number; head: number };
}

function serializeAnchorTag(kind: AnchorKind, id: string, slash: boolean) {
  return `<${slash ? '/' : ''}${kind} id="${id}">`;
}

function collectProtectedRanges(content: string): ProtectedRange[] {
  const parsed = parseAnchorBlocks(content);
  const ranges: ProtectedRange[] = [];

  for (const block of parsed.blocks) {
    ranges.push({ from: block.openTagFrom, to: block.openTagTo });
    ranges.push({ from: block.closeTagFrom, to: block.closeTagTo });
  }

  for (const invalid of parsed.invalidTokens) {
    ranges.push({ from: invalid.from, to: invalid.to });
  }

  return ranges.sort((left, right) => left.from - right.from);
}

function touchesProtectedRange(change: ProtectedRange, protectedRange: ProtectedRange): boolean {
  const isInsertion = change.from === change.to;
  if (isInsertion) {
    return change.from > protectedRange.from && change.from < protectedRange.to;
  }
  return change.from < protectedRange.to && change.to > protectedRange.from;
}

function mapRawPositionToVisibleOffset(position: number, protectedRanges: ProtectedRange[]) {
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

function mapVisibleOffsetToRawPosition(position: number, protectedRanges: ProtectedRange[]) {
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

function stripAnchorTags(value: string) {
  return value.replace(/<\/?(?:highlight|cloze)\s+id="[^"]+"\s*>/g, '');
}

function applyVisibleReplace(anchor: AnchorRange, from: number, to: number, insertLength: number): AnchorRange {
  if (to <= anchor.start) {
    const delta = insertLength - (to - from);
    return { ...anchor, end: anchor.end + delta, start: anchor.start + delta };
  }

  if (from >= anchor.end) {
    return anchor;
  }

  const prefixLength = Math.max(0, Math.min(from, anchor.end) - anchor.start);
  const suffixLength = Math.max(0, anchor.end - Math.max(to, anchor.start));
  const start = from < anchor.start ? from : anchor.start;

  return {
    ...anchor,
    end: start + prefixLength + insertLength + suffixLength,
    start
  };
}

function rebuildContent(visibleText: string, anchors: AnchorRange[]) {
  const openings = new Map<number, AnchorRange[]>();
  const closings = new Map<number, AnchorRange[]>();
  const emptyAnchors = new Map<number, AnchorRange[]>();

  for (const anchor of anchors) {
    if (anchor.start === anchor.end) {
      const items = emptyAnchors.get(anchor.start) ?? [];
      items.push(anchor);
      emptyAnchors.set(anchor.start, items);
      continue;
    }
    const starts = openings.get(anchor.start) ?? [];
    starts.push(anchor);
    openings.set(anchor.start, starts);
    const ends = closings.get(anchor.end) ?? [];
    ends.push(anchor);
    closings.set(anchor.end, ends);
  }

  const buffer: string[] = [];
  for (let position = 0; position <= visibleText.length; position += 1) {
    const ending = closings.get(position);
    if (ending) {
      ending.sort((left, right) => left.closeOrder - right.closeOrder);
      for (const anchor of ending) buffer.push(serializeAnchorTag(anchor.kind, anchor.id, true));
    }

    const starting = openings.get(position);
    if (starting) {
      starting.sort((left, right) => left.openOrder - right.openOrder);
      for (const anchor of starting) buffer.push(serializeAnchorTag(anchor.kind, anchor.id, false));
    }

    const empty = emptyAnchors.get(position);
    if (empty) {
      empty.sort((left, right) => left.openOrder - right.openOrder);
      for (const anchor of empty) {
        buffer.push(serializeAnchorTag(anchor.kind, anchor.id, false));
        buffer.push(serializeAnchorTag(anchor.kind, anchor.id, true));
      }
    }

    if (position < visibleText.length) {
      buffer.push(visibleText[position]);
    }
  }

  return buffer.join('');
}

export function recoverAnchorMutation(input: AnchorMutationRecoveryInput): AnchorMutationRecoveryResult | null {
  const parsed = parseAnchorBlocks(input.content);
  if (parsed.blocks.length === 0 || parsed.invalidTokens.length > 0) {
    return null;
  }

  const protectedRanges = collectProtectedRanges(input.content);
  let touchesAnchorTags = false;
  for (const change of input.changes) {
    if (protectedRanges.some((range) => touchesProtectedRange(change, range))) {
      touchesAnchorTags = true;
      if (change.from === change.to) {
        return null;
      }
    }
  }

  if (!touchesAnchorTags) {
    return null;
  }

  let visibleText = stripAnchorTags(input.content);
  let visibleDelta = 0;
  let anchors: AnchorRange[] = parsed.blocks.map((block) => ({
    closeOrder: block.closeTagFrom,
    end: mapRawPositionToVisibleOffset(block.contentTo, protectedRanges),
    id: block.id,
    kind: block.kind,
    openOrder: block.openTagFrom,
    start: mapRawPositionToVisibleOffset(block.contentFrom, protectedRanges)
  }));

  for (const change of input.changes) {
    const from = mapRawPositionToVisibleOffset(change.from, protectedRanges) + visibleDelta;
    const to = mapRawPositionToVisibleOffset(change.to, protectedRanges) + visibleDelta;
    visibleText = `${visibleText.slice(0, from)}${change.insert}${visibleText.slice(to)}`;
    anchors = anchors.map((anchor) => applyVisibleReplace(anchor, from, to, change.insert.length));
    visibleDelta += change.insert.length - (to - from);
  }

  const content = rebuildContent(visibleText, anchors);
  const nextProtectedRanges = collectProtectedRanges(input.nextContent);
  const rebuiltProtectedRanges = collectProtectedRanges(content);
  const anchor = mapVisibleOffsetToRawPosition(
    mapRawPositionToVisibleOffset(input.selection.main.anchor, nextProtectedRanges),
    rebuiltProtectedRanges
  );
  const head = mapVisibleOffsetToRawPosition(
    mapRawPositionToVisibleOffset(input.selection.main.head, nextProtectedRanges),
    rebuiltProtectedRanges
  );

  return {
    content,
    selection: { anchor, head }
  };
}
