import { collectInlineLinkPresentationPlan, type InlinePresentationPlan } from './inlinePresentationPlans';
import { collectMarkdownInlineLinkRanges } from './markdownInlineLinkProjection';
import type { MarkdownInlineLinkRange } from './markdownInlineProjectionTypes';

function isMultilineLink(source: string, from: number, to: number) {
  return source.slice(from, to).includes('\n');
}

function isPositionInsideRange(position: number | null | undefined, from: number, to: number) {
  return position !== null && position !== undefined && position >= from && position <= to;
}

export function collectMultilineLinkPresentationPlans(args: {
  links?: readonly MarkdownInlineLinkRange[];
  source: string;
  syntaxVisible?: boolean;
  syntaxVisiblePosition?: number | null;
}): InlinePresentationPlan[] {
  return (args.links ?? collectMarkdownInlineLinkRanges(args.source))
    .filter((link) => isMultilineLink(args.source, link.from, link.to))
    .map((link) => collectInlineLinkPresentationPlan(
      [link],
      Boolean(args.syntaxVisible) || isPositionInsideRange(args.syntaxVisiblePosition, link.from, link.to)
    ));
}
