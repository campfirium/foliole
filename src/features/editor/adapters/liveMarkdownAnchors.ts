import type { Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import {
  createAnchorKey,
  collectAnchorTagTokenRanges,
  collectAnchorTextSegments,
  type AnchorTextSegment
} from '../model/anchorTagSegments';

import { collectInlineLinkMatches } from './liveMarkdownInlineDecorations';
import { addMark, addReplace } from './liveMarkdownPrimitives';

export const INLINE_ANCHOR_TAG_PATTERN = /<(\/?)(highlight|cloze)\s+id="([1-9]\d*)"\s*>/g;

export function addAnchorTagDecorations(
  ranges: Range<Decoration>[],
  content: string,
  hiddenAnchorKeys: ReadonlySet<string> = new Set()
) {
  const segments = collectAnchorTextSegments(content, hiddenAnchorKeys);
  const tokenRanges = mergeAdjacentRanges(collectAnchorTagTokenRanges(content));

  for (const tokenRange of tokenRanges) addReplace(ranges, tokenRange.from, tokenRange.to);

  const highlightBaseRanges = collectMergedSegmentRanges(content, segments, (segment) => segment.activeHighlightCount > 0);
  const clozeRanges = collectMergedSegmentRanges(content, segments, (segment) => segment.activeClozeCount > 0);
  const highlightOverlapRanges = collectMergedSegmentRanges(content, segments, (segment) => segment.activeHighlightCount > 1);
  const mixedOverlapRanges = collectMergedSegmentRanges(
    content,
    segments,
    (segment) => segment.activeHighlightCount + segment.activeClozeCount > 1 && segment.activeHighlightCount <= 1
  );

  for (const range of highlightBaseRanges) addMark(ranges, range.from, range.to, 'cm-md-highlight');
  for (const range of clozeRanges) addMark(ranges, range.from, range.to, 'cm-md-cloze');
  for (const range of highlightOverlapRanges) addMark(ranges, range.from, range.to, 'cm-md-highlight-overlap');
  for (const range of mixedOverlapRanges) addMark(ranges, range.from, range.to, 'cm-md-anchor-overlap');
}

export function createInlineAnchorKey(anchor: { id: string; kind: 'highlight' | 'cloze' }) {
  return createAnchorKey(anchor);
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

function collectMergedSegmentRanges(
  content: string,
  segments: ReadonlyArray<AnchorTextSegment>,
  predicate: (segment: Readonly<AnchorTextSegment>) => boolean
) {
  const picked: Array<{ from: number; to: number }> = [];
  for (const segment of segments) {
    if (!predicate(segment)) continue;
    picked.push({ from: segment.from, to: segment.to });
  }
  return mergeRangesAcrossAnchorTagGaps(content, picked);
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

function isAnchorTagGap(value: string) {
  if (!value.trim()) return true;
  const stripped = value.replace(/<\/?(?:highlight|cloze)\s+id="[^"]+"\s*>/g, '').trim();
  return stripped.length === 0;
}

export function getCursorLineNumber(view: EditorView) {
  if (!view.hasFocus) return null;
  const cursor = view.state.selection.main.head;
  return view.state.doc.lineAt(cursor).number;
}

function rangeOverlaps(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number) {
  return leftFrom < rightTo && leftTo > rightFrom;
}

export function collectSelectionTextWithExpandedLinks(view: EditorView) {
  const { state } = view;
  const selectionRanges = state.selection.ranges;
  const pieces: string[] = [];
  let expanded = false;

  for (const range of selectionRanges) {
    if (range.empty) continue;
    let from = range.from;
    let to = range.to;
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(Math.max(from, to - 1)).number;

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const linkMatches = collectInlineLinkMatches(line.from, line.text, []);
      for (const linkMatch of linkMatches) {
        if (!rangeOverlaps(from, to, linkMatch.labelFrom, linkMatch.labelTo)) continue;
        from = Math.min(from, linkMatch.from);
        to = Math.max(to, linkMatch.to);
        expanded = true;
      }
    }
    pieces.push(state.doc.sliceString(from, to));
  }

  if (pieces.length === 0 || !expanded) return null;
  return pieces.join('\n');
}
