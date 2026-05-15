import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { InlinePresentationPlan } from '../model/inlinePresentationPlans';
import type { InlineTextDecorationPlan } from '../model/inlineTextDecorationPlans';
import { collectPreviewViewportPlans, collectSourceViewportPlans, type ViewportPreviewLinePlan } from '../model/liveMarkdownViewportPlans';
import { collectMarkdownForumTitleLinkRanges } from '../model/markdownForumTitleLinkProjection';
import { collectMarkdownLinkReferences, type MarkdownLinkReferenceRange } from '../model/markdownLinkReferences';
import { isPositionInsideInactiveTable } from '../model/markdownTableViewport';

import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
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
import { addImageDecorations } from './liveMarkdownInlineDecorations';
import { addPrefixDecoration } from './liveMarkdownPrefixDecorations';
import {
  addCodeFenceDecoration,
  addLine,
  addMark,
  addReplace,
  addThematicBreakDecoration
} from './liveMarkdownPrimitives';
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

export function buildPreviewDecorationSet(view: EditorView, context: DecorationBuildContext): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const startLine = view.state.doc.line(startLineNumber);
  const endLine = view.state.doc.line(endLineNumber);
  const source = view.state.doc.toString();
  const codeFenceProjection = collectCodeFenceProjection(view);
  const linkReferences = collectMarkdownLinkReferences(source);
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
  addForumTitleLinkDecorations(ranges, forumTitleLinks);

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
