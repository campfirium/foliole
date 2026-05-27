import { type Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

import { collectAiCitationMarkerMatches } from '../model/inlineMarkdownMatches';
import type { InlinePresentationPlan } from '../model/inlinePresentationPlans';
import type { InlineTextDecorationPlan } from '../model/inlineTextDecorationPlans';
import type { ViewportPreviewLinePlan } from '../model/liveMarkdownViewportPlans';
import { isPositionInsideInactiveTable } from '../model/markdownTableViewport';

import {
  collectCalloutPrefixRangeByLineFrom,
  collectPrefixRangesByLineFrom,
  collectViewportTablePlans
} from './liveMarkdownDecorationCollections';
import { addAiCitationMarkerDecorations, addFootnoteDecorations } from './liveMarkdownFootnotes';
import { addImageDecorations } from './liveMarkdownInlineDecorations';
import { addPrefixDecoration } from './liveMarkdownPrefixDecorations';
import {
  addCodeFenceDecoration,
  addLine,
  addMark,
  addReplace,
  addThematicBreakDecoration
} from './liveMarkdownPrimitives';

interface PreviewDecorationContext {
  activePosition: number | null;
  calloutPrefixRangeByLineFrom: ReturnType<typeof collectCalloutPrefixRangeByLineFrom>;
  cursorLineNumber: number | null;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  markdownSyntaxVisible: boolean;
  mermaidLineFroms?: ReadonlySet<number>;
  nodeId: string | null;
  onMissingAttachmentResource: Parameters<typeof addImageDecorations>[5];
  prefixRangesByLineFrom: ReturnType<typeof collectPrefixRangesByLineFrom>;
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
  context: PreviewDecorationContext
) {
  if (!plan.imageVisible) return;
  addImageDecorations(
    ranges,
    plan.imageMatches,
    false,
    context.nodeId,
    context.imageClozePresentationVersion,
    context.onMissingAttachmentResource
  );
}

function addPreviewPrefixDecorations(
  ranges: Range<Decoration>[],
  lineFrom: number,
  lineText: string,
  plan: ViewportPreviewLinePlan['plan'],
  context: PreviewDecorationContext
) {
  if (!plan.prefixVisible) return;
  const calloutPrefixRange = context.calloutPrefixRangeByLineFrom.get(lineFrom);
  const prefixRanges = context.prefixRangesByLineFrom.get(lineFrom);
  addPrefixDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, {
    ...(calloutPrefixRange ? { calloutPrefixRange } : {}),
    forceHideHeadingSyntax: true,
    ...(prefixRanges ? { prefixRanges } : {})
  });
}

export function addPreviewViewportDecorations(
  ranges: Range<Decoration>[],
  viewportPlans: readonly ViewportPreviewLinePlan[],
  viewportTablePlans: ReturnType<typeof collectViewportTablePlans>,
  context: PreviewDecorationContext & {
    hideLinkReferenceDefinition: (ranges: Range<Decoration>[], lineFrom: number) => boolean;
  }
) {
  for (const { lineFrom, lineText, plan } of viewportPlans) {
    if (isPositionInsideInactiveTable(lineFrom, viewportTablePlans)) continue;
    if (context.mermaidLineFroms?.has(lineFrom)) continue;
    if (plan.lineClass) addLine(ranges, lineFrom, plan.lineClass);
    if (context.hideLinkReferenceDefinition(ranges, lineFrom)) continue;
    addPreviewImageDecorations(ranges, plan, context);
    addPreviewPrefixDecorations(ranges, lineFrom, lineText, plan, context);
    addThematicBreakDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, plan.isThematicBreak);
    addCodeFenceDecoration(ranges, lineFrom, lineText, plan.showSyntaxOnLine, plan.isCodeFenceLine);
    if (plan.imageVisible) addAiCitationMarkerDecorations(ranges, collectAiCitationMarkerMatches(lineFrom, lineText, []));
    addFootnoteDecorations(ranges, plan.footnoteMatches);
    if (!plan.showSyntaxOnLine) {
      for (const escapedRange of plan.escapedRanges) addReplace(ranges, escapedRange.from, escapedRange.to);
    }
    for (const inlinePlan of plan.inlinePresentationPlans) applyInlinePresentationPlan(ranges, inlinePlan);
    for (const textPlan of plan.textDecorationPlans) applyInlineTextDecorationPlan(ranges, textPlan);
  }
}
