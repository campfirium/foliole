import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { InlinePresentationPlan } from '../model/inlinePresentationPlans';
import type { InlineTextDecorationPlan } from '../model/inlineTextDecorationPlans';
import {
  collectPreviewViewportPlans,
  collectSourceViewportPlans,
  type ViewportPreviewLinePlan,
  type ViewportLineInput
} from '../model/liveMarkdownViewportPlans';
import {
  collectMarkdownLineClassRanges,
  collectMarkdownPrefixRanges,
  collectMarkdownThematicBreakRanges,
  type MarkdownPrefixRange
} from '../model/markdownBlockProjection';
import { collectMarkdownCodeFenceProjection } from '../model/markdownCodeFenceProjection';
import {
  collectMarkdownLinkReferenceRanges,
  collectMarkdownLinkReferences,
  type MarkdownLinkReferenceRange
} from '../model/markdownLinkReferences';
import { collectMarkdownCalloutPrefixRanges, type MarkdownCalloutPrefixRange } from '../model/markdownOblikeBlockProjection';
import {
  collectMarkdownTablePlans,
} from '../model/markdownTablePlans';
import {
  collectViewportMarkdownTablePlans,
  isPositionInsideInactiveTable
} from '../model/markdownTableViewport';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { addFootnoteDecorations } from './liveMarkdownFootnotes';
import { addImageDecorations } from './liveMarkdownInlineDecorations';
import { addPrefixDecoration } from './liveMarkdownPrefixDecorations';
import {
  addCodeFenceDecoration,
  addLine,
  addMark,
  addReplace,
  addThematicBreakDecoration
} from './liveMarkdownPrimitives';
import { getTextAnchorDecorations } from './liveMarkdownState';
import { addTableDecorations } from './liveMarkdownTables';
import { addOrphanTableScaffoldDecorations } from './liveMarkdownTableScaffolds';
import { resolveVisibleLineWindow } from './liveMarkdownViewport';

interface DecorationBuildContext {
  activePosition: number | null;
  cursorLineNumber: number | null;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  markdownSyntaxVisible: boolean;
  nodeId: string | null;
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null;
}

function applyInlineTextDecorationPlan(ranges: Range<Decoration>[], plan: InlineTextDecorationPlan) {
  for (const range of plan.markRanges) addMark(ranges, range.from, range.to, range.className);
  for (const range of plan.replaceRanges) addReplace(ranges, range.from, range.to);
}

function applyInlinePresentationPlan(ranges: Range<Decoration>[], plan: InlinePresentationPlan) {
  for (const range of plan.markRanges) addMark(ranges, range.from, range.to, range.className, range.attributes);
  for (const range of plan.replaceRanges) addReplace(ranges, range.from, range.to);
}

function addPreviewImageDecorations(
  ranges: Range<Decoration>[],
  plan: ViewportPreviewLinePlan['plan'],
  context: DecorationBuildContext
) {
  if (!plan.imageVisible) {
    return;
  }
  addImageDecorations(
    ranges,
    plan.imageMatches,
    false,
    context.nodeId,
    context.imageClozePresentationVersion,
    context.onMissingAttachmentResource
  );
}

function hideLinkReferenceDefinition(
  ranges: Range<Decoration>[],
  lineFrom: number,
  linkReferenceRangeByLineFrom: ReadonlyMap<number, MarkdownLinkReferenceRange>
) {
  const linkReferenceRange = linkReferenceRangeByLineFrom.get(lineFrom);
  if (!linkReferenceRange) return false;
  addReplace(ranges, linkReferenceRange.from, linkReferenceRange.to);
  return true;
}

function collectViewportLines(view: EditorView, startLineNumber: number, endLineNumber: number): ViewportLineInput[] {
  const lines: ViewportLineInput[] = [];

  for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    lines.push({ from: line.from, lineNumber, text: line.text });
  }

  return lines;
}

function collectCodeFenceProjection(view: EditorView) {
  return collectMarkdownCodeFenceProjection(view.state.doc.toString());
}

function collectThematicBreakLineFroms(view: EditorView) {
  return new Set(collectMarkdownThematicBreakRanges(view.state.doc.toString()).map((range) => range.from));
}

function collectLinkReferenceRangeByLineFrom(view: EditorView) {
  const rangesByLineFrom = new Map<number, MarkdownLinkReferenceRange>();
  for (const range of collectMarkdownLinkReferenceRanges(view.state.doc.toString())) {
    rangesByLineFrom.set(range.lineFrom, range);
  }
  return rangesByLineFrom;
}

function collectLineClassByFrom(view: EditorView) {
  return new Map(collectMarkdownLineClassRanges(view.state.doc.toString()).map((range) => [range.from, range.className]));
}

function collectPrefixRangesByLineFrom(view: EditorView) {
  const rangesByLineFrom = new Map<number, MarkdownPrefixRange[]>();
  for (const range of collectMarkdownPrefixRanges(view.state.doc.toString())) {
    const ranges = rangesByLineFrom.get(range.lineFrom) ?? [];
    ranges.push(range);
    rangesByLineFrom.set(range.lineFrom, ranges);
  }
  return rangesByLineFrom;
}

function collectCalloutPrefixRangeByLineFrom(view: EditorView) {
  const rangesByLineFrom = new Map<number, MarkdownCalloutPrefixRange>();
  for (const range of collectMarkdownCalloutPrefixRanges(view.state.doc.toString())) {
    rangesByLineFrom.set(range.lineFrom, range);
  }
  return rangesByLineFrom;
}

export function buildPreviewDecorationSet(view: EditorView, context: DecorationBuildContext): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const startLine = view.state.doc.line(startLineNumber);
  const endLine = view.state.doc.line(endLineNumber);
  const source = view.state.doc.toString();
  const codeFenceProjection = collectCodeFenceProjection(view);
  const linkReferences = collectMarkdownLinkReferences(source);
  const linkReferenceRangeByLineFrom = collectLinkReferenceRangeByLineFrom(view);
  const linkReferenceLineFroms = new Set(linkReferenceRangeByLineFrom.keys());
  const calloutPrefixRangeByLineFrom = collectCalloutPrefixRangeByLineFrom(view);
  const lineClassByFrom = collectLineClassByFrom(view);
  const prefixRangesByLineFrom = collectPrefixRangesByLineFrom(view);
  const thematicBreakLineFroms = collectThematicBreakLineFroms(view);
  const tablePlans = collectMarkdownTablePlans({
    activePosition: null,
    anchorDecorations: getTextAnchorDecorations(view),
    from: 0,
    linkReferences,
    text: source
  });
  const viewportTablePlans = collectViewportMarkdownTablePlans(tablePlans, { from: startLine.from, to: endLine.to });
  const viewportPlans = collectPreviewViewportPlans({
    codeFenceLineFroms: codeFenceProjection.fenceLineFroms,
    codeLineFroms: codeFenceProjection.codeLineFroms,
    cursorLineNumber: context.cursorLineNumber,
    hideTitleHeading: context.hideTitleHeading,
    lineClassByFrom,
    linkReferenceLineFroms,
    lines: collectViewportLines(view, startLineNumber, endLineNumber),
    linkReferences,
    markdownSyntaxVisible: context.markdownSyntaxVisible,
    startInCodeBlock: false,
    thematicBreakLineFroms
  });

  addTableDecorations(ranges, viewportTablePlans, view.state.doc);
  addOrphanTableScaffoldDecorations(ranges, viewportPlans, viewportTablePlans);

  for (const { lineFrom, lineText, plan } of viewportPlans) {
    if (isPositionInsideInactiveTable(lineFrom, viewportTablePlans)) {
      continue;
    }
    if (plan.lineClass) addLine(ranges, lineFrom, plan.lineClass);
    if (hideLinkReferenceDefinition(ranges, lineFrom, linkReferenceRangeByLineFrom)) continue;
    addPreviewImageDecorations(ranges, plan, context);

    if (plan.prefixVisible) {
      const calloutPrefixRange = calloutPrefixRangeByLineFrom.get(lineFrom);
      const prefixRanges = prefixRangesByLineFrom.get(lineFrom);
      addPrefixDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, {
        ...(calloutPrefixRange ? { calloutPrefixRange } : {}),
        forceHideHeadingSyntax: true,
        ...(prefixRanges ? { prefixRanges } : {})
      });
    }
    addThematicBreakDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, plan.isThematicBreak);
    addCodeFenceDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, plan.isCodeFenceLine);
    addFootnoteDecorations(ranges, plan.footnoteMatches);
    for (const inlinePlan of plan.inlinePresentationPlans) applyInlinePresentationPlan(ranges, inlinePlan);
    for (const textPlan of plan.textDecorationPlans) applyInlineTextDecorationPlan(ranges, textPlan);
  }

  return Decoration.set(ranges, true);
}

export function buildSourceDecorationSet(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const codeFenceProjection = collectCodeFenceProjection(view);
  const linkReferences = collectMarkdownLinkReferences(view.state.doc.toString());
  const calloutPrefixRangeByLineFrom = collectCalloutPrefixRangeByLineFrom(view);
  const prefixRangesByLineFrom = collectPrefixRangesByLineFrom(view);
  const viewportPlans = collectSourceViewportPlans({
    codeFenceLineFroms: codeFenceProjection.fenceLineFroms,
    codeLineFroms: codeFenceProjection.codeLineFroms,
    lines: collectViewportLines(view, startLineNumber, endLineNumber),
    linkReferences,
    startInCodeBlock: false
  });

  for (const { lineFrom, lineText, plan } of viewportPlans) {
    const calloutPrefixRange = calloutPrefixRangeByLineFrom.get(lineFrom);
    const prefixRanges = prefixRangesByLineFrom.get(lineFrom);
    addPrefixDecoration(ranges, lineFrom, lineText, true, {
      ...(calloutPrefixRange ? { calloutPrefixRange } : {}),
      ...(prefixRanges ? { prefixRanges } : {})
    });
    addCodeFenceDecoration(ranges, lineFrom, lineText, true, plan.isCodeFenceLine);
    addFootnoteDecorations(ranges, plan.footnoteMatches);
    for (const inlinePlan of plan.inlinePresentationPlans) applyInlinePresentationPlan(ranges, inlinePlan);
    for (const textPlan of plan.textDecorationPlans) applyInlineTextDecorationPlan(ranges, textPlan);
  }

  return Decoration.set(ranges, true);
}
