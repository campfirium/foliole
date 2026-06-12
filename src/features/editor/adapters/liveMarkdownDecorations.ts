import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { InlinePresentationPlan } from '../model/inlinePresentationPlans';
import type { InlineTextDecorationPlan } from '../model/inlineTextDecorationPlans';
import { collectPreviewViewportPlans, collectSourceViewportPlans } from '../model/liveMarkdownViewportPlans';
import { collectImageMatchesFromTree } from '../model/markdownImageMatches';
import { collectMarkdownInlineLinkRangesFromTree } from '../model/markdownInlineLinkProjection';
import type { MarkdownInlineLinkRange } from '../model/markdownInlineProjectionTypes';
import {
  collectMarkdownLinkReferencesFromTree,
  type MarkdownLinkReferenceRange,
  type MarkdownSyntaxTree
} from '../model/markdownLinkReferences';
import { collectMarkdownMathRangesFromTree } from '../model/markdownMathRanges';
import { collectMultilineLinkPresentationPlans } from '../model/markdownMultilineLinkPresentation';

import { readVisibleMarkdownSyntaxTree } from './codeMirrorMarkdownSyntaxTree';
import type { EditorMissingAttachmentResourceHandler } from './EditorAdapter';
import { addPreviewBlockDecorations, collectPreviewMermaidLineFroms } from './liveMarkdownBlockDecorations';
import { addCodeFenceCopyDecorations } from './liveMarkdownCodeFenceCopy';
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
import { collectViewportForumTitleLinks } from './liveMarkdownForumTitleLinkViewport';
import type { EditedMathRange } from './liveMarkdownMathEditState';
import { addEditedMathSourceDecorations } from './liveMarkdownMathSource';
import { addPrefixDecoration } from './liveMarkdownPrefixDecorations';
import { addPreviewViewportDecorations } from './liveMarkdownPreviewViewportDecorations';
import { addCodeFenceDecoration, addMark, addReplace } from './liveMarkdownPrimitives';
import { addReadwiseOriginalFileDecorations } from './liveMarkdownReadwiseOriginalFile';
import { addTableDecorations } from './liveMarkdownTables';
import { addOrphanTableScaffoldDecorations } from './liveMarkdownTableScaffolds';
import { resolveVisibleLineWindow } from './liveMarkdownViewport';
import {
  collectPreviewViewportContext,
  collectViewportReadwiseOriginalFilePlaceholders
} from './liveMarkdownViewportContext';

interface DecorationBuildContext {
  activePosition: number | null;
  cursorLineNumber: number | null;
  editedMathRange: EditedMathRange | null;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  localDocumentPath: string | null;
  markdownSyntaxVisible: boolean;
  nodeId: string | null;
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null;
}

export interface PreviewMarkdownParse {
  markdownTree: MarkdownSyntaxTree;
  source: string;
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

function addEditedMathSourceDecoration(
  ranges: Range<Decoration>[],
  view: EditorView,
  mathRanges: ReturnType<typeof collectMarkdownMathRangesFromTree>,
  editedMathRange: EditedMathRange | null
) {
  const mathRange = mathRanges.find((range) => editedMathRange?.from === range.from && editedMathRange.to === range.to);
  if (mathRange) addEditedMathSourceDecorations(ranges, view.state.doc, mathRange);
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

function collectPreviewDecorationData(view: EditorView, parsed: PreviewMarkdownParse, context: DecorationBuildContext) {
  const viewport = collectPreviewViewportContext(view);
  const { markdownTree, source } = parsed;
  const codeFenceProjection = collectCodeFenceProjection(markdownTree, source);
  const linkReferences = collectMarkdownLinkReferencesFromTree(markdownTree, source);
  const documentImageMatches = collectImageMatchesFromTree(markdownTree, 0, source, linkReferences, {
    allowRelativeImages: Boolean(context.localDocumentPath)
  });
  const linkReferenceRangeByLineFrom = collectLinkReferenceRangeByLineFrom(markdownTree, source);
  const viewportTablePlans = collectViewportTablePlans({
    endLine: viewport.endLine,
    linkReferences,
    markdownTree,
    source,
    startLine: viewport.startLine,
    view
  });
  return {
    codeFenceProjection,
    calloutPrefixRangeByLineFrom: collectCalloutPrefixRangeByLineFrom(markdownTree, source),
    forumTitleLinks: collectViewportForumTitleLinks(view, viewport, codeFenceProjection.codeLineFroms),
    inlineLinks: collectMarkdownInlineLinkRangesFromTree(markdownTree, source, 0, linkReferences),
    linkReferenceRangeByLineFrom,
    mathRanges: collectMarkdownMathRangesFromTree(markdownTree, source),
    prefixRangesByLineFrom: collectPrefixRangesByLineFrom(markdownTree, source),
    readwiseOriginalFilePlaceholders: collectViewportReadwiseOriginalFilePlaceholders(
      view,
      viewport.startLineNumber,
      viewport.endLineNumber,
      viewport.viewportRange
    ),
    source,
    viewport,
    viewportPlans: collectPreviewViewportPlans({
      codeFenceLineFroms: codeFenceProjection.fenceLineFroms,
      codeLineFroms: codeFenceProjection.codeLineFroms,
      cursorLineNumber: context.cursorLineNumber,
      hideTitleHeading: context.hideTitleHeading,
      lineClassByFrom: collectLineClassByFrom(markdownTree, source),
      linkReferenceLineFroms: new Set(linkReferenceRangeByLineFrom.keys()),
      lines: collectViewportLines(view, viewport.startLineNumber, viewport.endLineNumber),
      linkReferences,
      localDocumentPath: context.localDocumentPath,
      markdownSyntaxVisible: context.markdownSyntaxVisible,
      documentImageMatches,
      source,
      startInCodeBlock: false,
      thematicBreakLineFroms: collectThematicBreakLineFroms(markdownTree, source)
    }),
    viewportTablePlans
  };
}

export function buildPreviewDecorationSet(
  view: EditorView,
  parsed: PreviewMarkdownParse,
  context: DecorationBuildContext
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const data = collectPreviewDecorationData(view, parsed, context);

  addTableDecorations(ranges, data.viewportTablePlans, view.state.doc);
  addReadwiseOriginalFileDecorations(ranges, data.readwiseOriginalFilePlaceholders, context.nodeId);
  addOrphanTableScaffoldDecorations(ranges, data.viewportPlans, data.viewportTablePlans);
  addForumTitleLinkDecorations(ranges, data.forumTitleLinks);
  addPreviewBlockDecorations(ranges, { codeFenceProjection: data.codeFenceProjection, context, mathRanges: data.mathRanges, source: data.source, view });
  addEditedMathSourceDecoration(ranges, view, data.mathRanges, context.editedMathRange);
  addCodeFenceCopyDecorations(ranges, data.source, data.codeFenceProjection.codeBlocks, data.viewport.viewportRange, view);
  addCodeFenceSyntaxHighlightDecorations(ranges, data.source, data.codeFenceProjection.codeBlocks, data.viewport.viewportRange);
  addMultilineLinkDecorations(ranges, data.source, {
    links: data.inlineLinks,
    syntaxVisiblePosition: context.markdownSyntaxVisible ? context.activePosition : null
  });

  addPreviewViewportDecorations(ranges, data.viewportPlans, data.viewportTablePlans, {
    ...context,
    calloutPrefixRangeByLineFrom: data.calloutPrefixRangeByLineFrom,
    hideLinkReferenceDefinition: (targetRanges, lineFrom) =>
      hideLinkReferenceDefinition(targetRanges, lineFrom, data.linkReferenceRangeByLineFrom),
    mermaidLineFroms: collectPreviewMermaidLineFroms(data.source, data.codeFenceProjection, view),
    prefixRangesByLineFrom: data.prefixRangesByLineFrom
  });

  return Decoration.set(ranges, true);
}

export function buildSourceDecorationSet(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const source = view.state.doc.toString();
  const markdownTree = readVisibleMarkdownSyntaxTree(view);
  const codeFenceProjection = collectCodeFenceProjection(markdownTree, source);
  const linkReferences = collectMarkdownLinkReferencesFromTree(markdownTree, source);
  const inlineLinks = collectMarkdownInlineLinkRangesFromTree(markdownTree, source, 0, linkReferences);
  const calloutPrefixRangeByLineFrom = collectCalloutPrefixRangeByLineFrom(markdownTree, source);
  const prefixRangesByLineFrom = collectPrefixRangesByLineFrom(markdownTree, source);
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
  addCodeFenceCopyDecorations(ranges, source, codeFenceProjection.codeBlocks, {
    from: view.state.doc.line(startLineNumber).from,
    to: view.state.doc.line(endLineNumber).to
  }, view);

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
