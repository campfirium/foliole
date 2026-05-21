import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import { folioleMarkdownParser } from '../model/folioleMarkdownParser';
import type { InlinePresentationPlan } from '../model/inlinePresentationPlans';
import type { InlineTextDecorationPlan } from '../model/inlineTextDecorationPlans';
import { collectPreviewViewportPlans, collectSourceViewportPlans } from '../model/liveMarkdownViewportPlans';
import { collectMarkdownForumTitleLinkRanges } from '../model/markdownForumTitleLinkProjection';
import { collectImageMatches } from '../model/markdownImageMatches';
import { collectMarkdownInlineLinkRangesFromTree } from '../model/markdownInlineLinkProjection';
import type { MarkdownInlineLinkRange } from '../model/markdownInlineProjectionTypes';
import { collectMarkdownLinkReferencesFromTree, type MarkdownLinkReferenceRange } from '../model/markdownLinkReferences';
import { collectMarkdownMathRangesFromTree } from '../model/markdownMathRanges';
import { collectMultilineLinkPresentationPlans } from '../model/markdownMultilineLinkPresentation';
import { collectReadwiseOriginalFilePlaceholderRangesFromLines } from '../model/readwiseOriginalFilePlaceholder';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { addCodeFenceSyntaxHighlightDecorations } from './liveMarkdownCodeFenceHighlight';
import {
  collectCalloutPrefixRangeByLineFrom,
  collectCodeFenceProjection,
  collectLineClassByFrom,
  collectLinkReferenceRangeByLineFrom,
  collectPrefixRangesByLineFrom,
  collectThematicBreakLineFroms,
  collectViewportLines,
  collectViewportTablePlans
} from './liveMarkdownDecorationCollections';
import { addFootnoteDecorations } from './liveMarkdownFootnotes';
import { addForumTitleLinkDecorations } from './liveMarkdownForumTitleLinkDecorations';
import { addMathDecorations } from './liveMarkdownMath';
import { addPrefixDecoration } from './liveMarkdownPrefixDecorations';
import { addPreviewViewportDecorations } from './liveMarkdownPreviewViewportDecorations';
import {
  addCodeFenceDecoration,
  addMark,
  addReplace,
} from './liveMarkdownPrimitives';
import { addReadwiseOriginalFileDecorations } from './liveMarkdownReadwiseOriginalFile';
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

function addMultilineLinkDecorations(
  ranges: Range<Decoration>[],
  source: string,
  args: { links?: readonly MarkdownInlineLinkRange[]; syntaxVisible?: boolean; syntaxVisiblePosition?: number | null } = {}
) {
  for (const inlinePlan of collectMultilineLinkPresentationPlans({ source, ...args })) {
    applyInlinePresentationPlan(ranges, inlinePlan);
  }
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

function collectViewportReadwiseOriginalFilePlaceholders(
  view: EditorView,
  startLineNumber: number,
  endLineNumber: number,
  viewportRange: { from: number; to: number }
) {
  const readwiseStartLineNumber = Math.max(1, startLineNumber - 3);
  const readwiseEndLineNumber = Math.min(view.state.doc.lines, endLineNumber + 3);
  return collectReadwiseOriginalFilePlaceholderRangesFromLines(
    collectViewportLines(view, readwiseStartLineNumber, readwiseEndLineNumber)
  ).filter((range) =>
    (range.to >= viewportRange.from && range.from <= viewportRange.to) ||
    range.hiddenRanges.some((hiddenRange) => hiddenRange.to >= viewportRange.from && hiddenRange.from <= viewportRange.to)
  );
}

export function buildPreviewDecorationSet(view: EditorView, context: DecorationBuildContext): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const startLine = view.state.doc.line(startLineNumber);
  const endLine = view.state.doc.line(endLineNumber);
  const viewportRange = { from: startLine.from, to: endLine.to };
  const source = view.state.doc.toString();
  const markdownTree = folioleMarkdownParser.parse(source);
  const viewportLines = collectViewportLines(view, startLineNumber, endLineNumber);
  const codeFenceProjection = collectCodeFenceProjection(view);
  const linkReferences = collectMarkdownLinkReferencesFromTree(markdownTree, source);
  const documentImageMatches = collectImageMatches(0, source, linkReferences);
  const inlineLinks = collectMarkdownInlineLinkRangesFromTree(markdownTree, source, 0, linkReferences);
  const mathRanges = collectMarkdownMathRangesFromTree(markdownTree, source);
  const forumTitleLinks = collectMarkdownForumTitleLinkRanges(source).filter(
    (link) => !(codeFenceProjection.codeLineFroms.has(link.from) || codeFenceProjection.codeLineFroms.has(link.urlLineFrom))
  );
  const linkReferenceRangeByLineFrom = collectLinkReferenceRangeByLineFrom(view);
  const linkReferenceLineFroms = new Set(linkReferenceRangeByLineFrom.keys());
  const calloutPrefixRangeByLineFrom = collectCalloutPrefixRangeByLineFrom(view);
  const lineClassByFrom = collectLineClassByFrom(view);
  const prefixRangesByLineFrom = collectPrefixRangesByLineFrom(view);
  const thematicBreakLineFroms = collectThematicBreakLineFroms(view);
  const viewportTablePlans = collectViewportTablePlans({ endLine, source, startLine, view });
  const readwiseOriginalFilePlaceholders = collectViewportReadwiseOriginalFilePlaceholders(view, startLineNumber, endLineNumber, viewportRange);
  const viewportPlans = collectPreviewViewportPlans({
    codeFenceLineFroms: codeFenceProjection.fenceLineFroms,
    codeLineFroms: codeFenceProjection.codeLineFroms,
    cursorLineNumber: context.cursorLineNumber,
    hideTitleHeading: context.hideTitleHeading,
    lineClassByFrom,
    linkReferenceLineFroms,
    lines: viewportLines,
    linkReferences,
    markdownSyntaxVisible: context.markdownSyntaxVisible,
    documentImageMatches,
    startInCodeBlock: false,
    thematicBreakLineFroms
  });

  addTableDecorations(ranges, viewportTablePlans, view.state.doc);
  addReadwiseOriginalFileDecorations(ranges, readwiseOriginalFilePlaceholders, context.nodeId);
  addOrphanTableScaffoldDecorations(ranges, viewportPlans, viewportTablePlans);
  addForumTitleLinkDecorations(ranges, forumTitleLinks);
  addMathDecorations(ranges, mathRanges, view, context.activePosition, context.nodeId, context.imageClozePresentationVersion);
  addCodeFenceSyntaxHighlightDecorations(ranges, source, codeFenceProjection.codeBlocks, viewportRange);
  addMultilineLinkDecorations(ranges, source, {
    links: inlineLinks,
    syntaxVisiblePosition: context.markdownSyntaxVisible ? context.activePosition : null
  });

  addPreviewViewportDecorations(ranges, viewportPlans, viewportTablePlans, {
    ...context,
    calloutPrefixRangeByLineFrom,
    hideLinkReferenceDefinition: (targetRanges, lineFrom) =>
      hideLinkReferenceDefinition(targetRanges, lineFrom, linkReferenceRangeByLineFrom),
    prefixRangesByLineFrom
  });

  return Decoration.set(ranges, true);
}

export function buildSourceDecorationSet(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const source = view.state.doc.toString();
  const markdownTree = folioleMarkdownParser.parse(source);
  const codeFenceProjection = collectCodeFenceProjection(view);
  const linkReferences = collectMarkdownLinkReferencesFromTree(markdownTree, source);
  const inlineLinks = collectMarkdownInlineLinkRangesFromTree(markdownTree, source, 0, linkReferences);
  const calloutPrefixRangeByLineFrom = collectCalloutPrefixRangeByLineFrom(view);
  const prefixRangesByLineFrom = collectPrefixRangesByLineFrom(view);
  const viewportPlans = collectSourceViewportPlans({
    codeFenceLineFroms: codeFenceProjection.fenceLineFroms,
    codeLineFroms: codeFenceProjection.codeLineFroms,
    lines: collectViewportLines(view, startLineNumber, endLineNumber),
    linkReferences,
    startInCodeBlock: false
  });

  addMultilineLinkDecorations(ranges, source, { links: inlineLinks, syntaxVisible: true });
  addCodeFenceSyntaxHighlightDecorations(ranges, source, codeFenceProjection.codeBlocks, {
    from: view.state.doc.line(startLineNumber).from,
    to: view.state.doc.line(endLineNumber).to
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
