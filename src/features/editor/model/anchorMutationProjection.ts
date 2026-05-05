import { stripAnchorBlocks } from './anchorBlocks';
import {
  collectAnchorProtectedRanges,
  collectAnchorRecords,
  doesChangeTouchAnchorProtectedRanges
} from './anchorRecords';
import { mapRawPositionToVisibleOffset, mapVisibleOffsetToRawPosition } from './anchorTextOffsets';
import { rebuildAnchoredText, type AnchorVisibleRange } from './anchorTextRebuild';

export interface AnchorMutationTextChange {
  from: number;
  insert: string;
  to: number;
}

export interface AnchorMutationProjectionInput {
  changes: AnchorMutationTextChange[];
  content: string;
  nextContent: string;
  selection: { anchor: number; head: number };
}

export interface AnchorMutationProjectionResult {
  content: string;
  selection: { anchor: number; head: number };
}

function applyVisibleReplace(anchor: AnchorVisibleRange, from: number, to: number, insertLength: number): AnchorVisibleRange {
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

export function projectAnchorMutation(input: AnchorMutationProjectionInput): AnchorMutationProjectionResult | null {
  const records = collectAnchorRecords(input.content);
  const protectedRanges = collectAnchorProtectedRanges(input.content);
  if (records.length === 0 || protectedRanges.length !== records.length * 2) {
    return null;
  }

  const touchesAnchorTags = doesChangeTouchAnchorProtectedRanges(input.changes, protectedRanges);
  if (!touchesAnchorTags) {
    return null;
  }

  for (const change of input.changes) {
    if (change.from === change.to && doesChangeTouchAnchorProtectedRanges([change], protectedRanges)) {
      return null;
    }
  }

  let visibleText = stripAnchorBlocks(input.content);
  let visibleDelta = 0;
  let anchors: AnchorVisibleRange[] = records.map((record) => ({
    closeOrder: record.closeTagFrom,
    end: mapRawPositionToVisibleOffset(input.content, record.to),
    id: record.id,
    kind: record.kind,
    openOrder: record.openTagFrom,
    start: mapRawPositionToVisibleOffset(input.content, record.from)
  }));

  for (const change of input.changes) {
    const from = mapRawPositionToVisibleOffset(input.content, change.from) + visibleDelta;
    const to = mapRawPositionToVisibleOffset(input.content, change.to) + visibleDelta;
    visibleText = `${visibleText.slice(0, from)}${change.insert}${visibleText.slice(to)}`;
    anchors = anchors.map((anchor) => applyVisibleReplace(anchor, from, to, change.insert.length));
    visibleDelta += change.insert.length - (to - from);
  }

  const content = rebuildAnchoredText(visibleText, anchors);
  return {
    content,
    selection: {
      anchor: mapVisibleOffsetToRawPosition(
        content,
        mapRawPositionToVisibleOffset(input.nextContent, input.selection.anchor)
      ),
      head: mapVisibleOffsetToRawPosition(
        content,
        mapRawPositionToVisibleOffset(input.nextContent, input.selection.head)
      )
    }
  };
}
