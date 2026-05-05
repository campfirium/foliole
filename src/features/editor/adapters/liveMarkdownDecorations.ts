import { type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView } from '@codemirror/view';

import type { InlinePresentationPlan } from '../model/inlinePresentationPlans';
import type { InlineTextDecorationPlan } from '../model/inlineTextDecorationPlans';
import {
  collectPreviewViewportPlans,
  collectSourceViewportPlans,
  type ViewportLineInput
} from '../model/liveMarkdownViewportPlans';
import { collectMarkdownTablePlans, isPositionInsideInactiveTable } from '../model/markdownTablePlans';

import { resolveCodeBlockStateBeforeLine } from './liveMarkdownCodeBlocks';
import { addFootnoteDecorations } from './liveMarkdownFootnotes';
import { addImageDecorations } from './liveMarkdownInlineDecorations';
import {
  addCodeFenceDecoration,
  addLine,
  addMark,
  addPrefixDecoration,
  addReplace
} from './liveMarkdownPrimitives';
import { getTextAnchorDecorations } from './liveMarkdownState';
import { addTableDecorations } from './liveMarkdownTables';
import { resolveVisibleLineWindow } from './liveMarkdownViewport';

interface DecorationBuildContext {
  activePosition: number | null;
  cursorLineNumber: number | null;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  markdownSyntaxVisible: boolean;
  nodeId: string | null;
}

function applyInlineTextDecorationPlan(ranges: Range<Decoration>[], plan: InlineTextDecorationPlan) {
  for (const range of plan.markRanges) addMark(ranges, range.from, range.to, range.className);
  for (const range of plan.replaceRanges) addReplace(ranges, range.from, range.to);
}

function applyInlinePresentationPlan(ranges: Range<Decoration>[], plan: InlinePresentationPlan) {
  for (const range of plan.markRanges) addMark(ranges, range.from, range.to, range.className, range.attributes);
  for (const range of plan.replaceRanges) addReplace(ranges, range.from, range.to);
}

function collectViewportLines(view: EditorView, startLineNumber: number, endLineNumber: number): ViewportLineInput[] {
  const lines: ViewportLineInput[] = [];

  for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    lines.push({ from: line.from, lineNumber, text: line.text });
  }

  return lines;
}

export function buildPreviewDecorationSet(view: EditorView, context: DecorationBuildContext): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const startLine = view.state.doc.line(startLineNumber);
  const endLine = view.state.doc.line(endLineNumber);
  const tablePlans = collectMarkdownTablePlans({
    activePosition: null,
    anchorDecorations: getTextAnchorDecorations(view),
    from: startLine.from,
    text: view.state.sliceDoc(startLine.from, endLine.to)
  });
  const viewportPlans = collectPreviewViewportPlans({
    cursorLineNumber: context.cursorLineNumber,
    hideTitleHeading: context.hideTitleHeading,
    lines: collectViewportLines(view, startLineNumber, endLineNumber),
    markdownSyntaxVisible: context.markdownSyntaxVisible,
    startInCodeBlock: resolveCodeBlockStateBeforeLine(view.state, startLineNumber)
  });

  addTableDecorations(ranges, tablePlans, view.state.doc);

  for (const { lineFrom, lineText, plan } of viewportPlans) {
    if (isPositionInsideInactiveTable(lineFrom, tablePlans)) {
      continue;
    }
    if (plan.lineClass) addLine(ranges, lineFrom, plan.lineClass);
    if (plan.imageVisible) {
      addImageDecorations(ranges, plan.imageMatches, false, context.nodeId, context.imageClozePresentationVersion);
    }

    if (plan.prefixVisible) {
      addPrefixDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, { forceHideHeadingSyntax: true });
    }
    addCodeFenceDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine);
    addFootnoteDecorations(ranges, plan.footnoteMatches);
    for (const inlinePlan of plan.inlinePresentationPlans) applyInlinePresentationPlan(ranges, inlinePlan);
    for (const textPlan of plan.textDecorationPlans) applyInlineTextDecorationPlan(ranges, textPlan);
  }

  return Decoration.set(ranges, true);
}

export function buildSourceDecorationSet(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { endLineNumber, startLineNumber } = resolveVisibleLineWindow(view);
  const viewportPlans = collectSourceViewportPlans({
    lines: collectViewportLines(view, startLineNumber, endLineNumber),
    startInCodeBlock: resolveCodeBlockStateBeforeLine(view.state, startLineNumber)
  });

  for (const { lineFrom, lineText, plan } of viewportPlans) {
    addPrefixDecoration(ranges, lineFrom, lineText, true);
    addCodeFenceDecoration(ranges, lineFrom, lineText, true);
    addFootnoteDecorations(ranges, plan.footnoteMatches);
    for (const inlinePlan of plan.inlinePresentationPlans) applyInlinePresentationPlan(ranges, inlinePlan);
    for (const textPlan of plan.textDecorationPlans) applyInlineTextDecorationPlan(ranges, textPlan);
  }

  return Decoration.set(ranges, true);
}
