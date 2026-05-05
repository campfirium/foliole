import type { InlineCodeMatch, InlineLinkMatch, WikiLinkMatch } from './inlineMarkdownMatches';
import type { SemanticRange } from './inlineSemanticMarks';

export interface InlinePresentationMarkRange extends SemanticRange {
  attributes?: Record<string, string>;
  className: string;
}

export interface InlinePresentationPlan {
  markRanges: InlinePresentationMarkRange[];
  replaceRanges: SemanticRange[];
}

export function collectInlineCodePresentationPlan(
  codeMatches: ReadonlyArray<InlineCodeMatch>,
  showSyntax: boolean
): InlinePresentationPlan {
  const markRanges: InlinePresentationMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];

  for (const codeMatch of codeMatches) {
    markRanges.push({
      className: 'cm-md-inline-code',
      from: codeMatch.contentFrom,
      to: codeMatch.contentTo
    });
    if (showSyntax) {
      markRanges.push({ className: 'cm-md-syntax-visible', from: codeMatch.from, to: codeMatch.contentFrom });
      markRanges.push({ className: 'cm-md-syntax-visible', from: codeMatch.contentTo, to: codeMatch.to });
      continue;
    }
    replaceRanges.push({ from: codeMatch.from, to: codeMatch.contentFrom });
    replaceRanges.push({ from: codeMatch.contentTo, to: codeMatch.to });
  }

  return { markRanges, replaceRanges };
}

export function collectInlineLinkPresentationPlan(
  linkMatches: ReadonlyArray<InlineLinkMatch>,
  showSyntax: boolean
): InlinePresentationPlan {
  const markRanges: InlinePresentationMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];

  for (const linkMatch of linkMatches) {
    markRanges.push({
      className: 'cm-md-link-text',
      from: linkMatch.labelFrom,
      to: linkMatch.labelTo,
      attributes: { 'data-md-link-url': linkMatch.href }
    });

    for (const hiddenRange of linkMatch.hiddenRanges) {
      if (showSyntax) {
        markRanges.push({ className: 'cm-md-syntax-visible', from: hiddenRange.from, to: hiddenRange.to });
      } else {
        replaceRanges.push({ from: hiddenRange.from, to: hiddenRange.to });
      }
    }
  }

  return { markRanges, replaceRanges };
}

export function collectWikiLinkPresentationPlan(
  linkMatches: ReadonlyArray<WikiLinkMatch>,
  showSyntax: boolean
): InlinePresentationPlan {
  const markRanges: InlinePresentationMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];

  for (const linkMatch of linkMatches) {
    markRanges.push({
      className: 'cm-md-link-text',
      from: linkMatch.labelFrom,
      to: linkMatch.labelTo,
      attributes: { 'data-md-link-node-title': linkMatch.title }
    });

    for (const hiddenRange of linkMatch.hiddenRanges) {
      if (showSyntax) {
        markRanges.push({ className: 'cm-md-syntax-visible', from: hiddenRange.from, to: hiddenRange.to });
      } else {
        replaceRanges.push({ from: hiddenRange.from, to: hiddenRange.to });
      }
    }
  }

  return { markRanges, replaceRanges };
}
