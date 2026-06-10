import type { EditorView } from '@codemirror/view';

import {
  collectMarkdownLineClassRangesFromTree,
  collectMarkdownPrefixRangesFromTree,
  collectMarkdownThematicBreakRangesFromTree
} from '../model/markdownBlockProjection';
import { collectMarkdownCodeFenceProjectionFromTree } from '../model/markdownCodeFenceProjection';
import {
  collectMarkdownLinkReferenceRangesFromTree,
  type MarkdownLinkReferenceMap,
  type MarkdownLinkReferenceRange,
  type MarkdownSyntaxTree
} from '../model/markdownLinkReferences';
import { collectMarkdownCalloutPrefixRangesFromTree, type MarkdownCalloutPrefixRange } from '../model/markdownOblikeBlockProjection';
import { collectMarkdownTablePlansFromTree } from '../model/markdownTablePlans';
import { collectViewportMarkdownTablePlans } from '../model/markdownTableViewport';

import { getTextAnchorDecorations } from './liveMarkdownState';

export function collectViewportLines(view: EditorView, startLineNumber: number, endLineNumber: number) {
  const lines: Array<{ from: number; lineNumber: number; text: string }> = [];
  for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    lines.push({ from: line.from, lineNumber, text: line.text });
  }
  return lines;
}

export function collectCodeFenceProjection(tree: MarkdownSyntaxTree, source: string) {
  return collectMarkdownCodeFenceProjectionFromTree(tree, source);
}

export function collectThematicBreakLineFroms(tree: MarkdownSyntaxTree, source: string) {
  return new Set(collectMarkdownThematicBreakRangesFromTree(tree, source).map((range) => range.from));
}

export function collectLinkReferenceRangeByLineFrom(tree: MarkdownSyntaxTree, source: string) {
  const rangesByLineFrom = new Map<number, MarkdownLinkReferenceRange>();
  for (const range of collectMarkdownLinkReferenceRangesFromTree(tree, source)) {
    rangesByLineFrom.set(range.lineFrom, range);
  }
  return rangesByLineFrom;
}

export function collectLineClassByFrom(tree: MarkdownSyntaxTree, source: string) {
  return new Map(collectMarkdownLineClassRangesFromTree(tree, source).map((range) => [range.from, range.className]));
}

export function collectPrefixRangesByLineFrom(tree: MarkdownSyntaxTree, source: string) {
  const rangesByLineFrom = new Map<number, Array<ReturnType<typeof collectMarkdownPrefixRangesFromTree>[number]>>();
  for (const range of collectMarkdownPrefixRangesFromTree(tree, source)) {
    const ranges = rangesByLineFrom.get(range.lineFrom) ?? [];
    ranges.push(range);
    rangesByLineFrom.set(range.lineFrom, ranges);
  }
  return rangesByLineFrom;
}

export function collectCalloutPrefixRangeByLineFrom(tree: MarkdownSyntaxTree, source: string) {
  const rangesByLineFrom = new Map<number, MarkdownCalloutPrefixRange>();
  for (const range of collectMarkdownCalloutPrefixRangesFromTree(tree, source)) {
    rangesByLineFrom.set(range.lineFrom, range);
  }
  return rangesByLineFrom;
}

export function collectViewportTablePlans(args: {
  endLine: { to: number };
  linkReferences: MarkdownLinkReferenceMap;
  markdownTree: MarkdownSyntaxTree;
  source: string;
  startLine: { from: number };
  view: EditorView;
}) {
  const tablePlans = collectMarkdownTablePlansFromTree({
    activePosition: null,
    anchorDecorations: getTextAnchorDecorations(args.view),
    from: 0,
    linkReferences: args.linkReferences,
    text: args.source,
    tree: args.markdownTree
  });
  return collectViewportMarkdownTablePlans(tablePlans, { from: args.startLine.from, to: args.endLine.to });
}
