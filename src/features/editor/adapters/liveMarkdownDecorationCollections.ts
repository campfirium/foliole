import type { EditorView } from '@codemirror/view';

import { collectMarkdownLineClassRanges, collectMarkdownPrefixRanges, collectMarkdownThematicBreakRanges } from '../model/markdownBlockProjection';
import { collectMarkdownCodeFenceProjection } from '../model/markdownCodeFenceProjection';
import { collectMarkdownLinkReferenceRanges, collectMarkdownLinkReferences, type MarkdownLinkReferenceRange } from '../model/markdownLinkReferences';
import { collectMarkdownCalloutPrefixRanges, type MarkdownCalloutPrefixRange } from '../model/markdownOblikeBlockProjection';
import { collectMarkdownTablePlans } from '../model/markdownTablePlans';
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

export function collectCodeFenceProjection(view: EditorView) {
  return collectMarkdownCodeFenceProjection(view.state.doc.toString());
}

export function collectThematicBreakLineFroms(view: EditorView) {
  return new Set(collectMarkdownThematicBreakRanges(view.state.doc.toString()).map((range) => range.from));
}

export function collectLinkReferenceRangeByLineFrom(view: EditorView) {
  const rangesByLineFrom = new Map<number, MarkdownLinkReferenceRange>();
  for (const range of collectMarkdownLinkReferenceRanges(view.state.doc.toString())) {
    rangesByLineFrom.set(range.lineFrom, range);
  }
  return rangesByLineFrom;
}

export function collectLineClassByFrom(view: EditorView) {
  return new Map(collectMarkdownLineClassRanges(view.state.doc.toString()).map((range) => [range.from, range.className]));
}

export function collectPrefixRangesByLineFrom(view: EditorView) {
  const rangesByLineFrom = new Map<number, Array<ReturnType<typeof collectMarkdownPrefixRanges>[number]>>();
  for (const range of collectMarkdownPrefixRanges(view.state.doc.toString())) {
    const ranges = rangesByLineFrom.get(range.lineFrom) ?? [];
    ranges.push(range);
    rangesByLineFrom.set(range.lineFrom, ranges);
  }
  return rangesByLineFrom;
}

export function collectCalloutPrefixRangeByLineFrom(view: EditorView) {
  const rangesByLineFrom = new Map<number, MarkdownCalloutPrefixRange>();
  for (const range of collectMarkdownCalloutPrefixRanges(view.state.doc.toString())) {
    rangesByLineFrom.set(range.lineFrom, range);
  }
  return rangesByLineFrom;
}

export function collectViewportTablePlans(args: {
  endLine: { to: number };
  source: string;
  startLine: { from: number };
  view: EditorView;
}) {
  const tablePlans = collectMarkdownTablePlans({
    activePosition: null,
    anchorDecorations: getTextAnchorDecorations(args.view),
    from: 0,
    linkReferences: collectMarkdownLinkReferences(args.source),
    text: args.source
  });
  return collectViewportMarkdownTablePlans(tablePlans, { from: args.startLine.from, to: args.endLine.to });
}
