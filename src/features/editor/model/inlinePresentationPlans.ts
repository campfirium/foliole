import type { AutolinkMatch, EmbedMatch, InlineCodeMatch, InlineLinkMatch, WikiLinkMatch } from './inlineMarkdownMatches';
import type { SemanticRange } from './inlineSemanticMarks';
import { isSafeMarkdownLinkHref } from './markdownLinkSafety';

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
      className: isSafeMarkdownLinkHref(linkMatch.href) ? 'cm-md-link-text' : 'cm-md-link-text cm-md-link-text-unsafe',
      from: linkMatch.labelFrom,
      to: linkMatch.labelTo,
      ...(isSafeMarkdownLinkHref(linkMatch.href) ? { attributes: { 'data-md-link-url': linkMatch.href } } : {})
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

export function collectAutolinkPresentationPlan(
  linkMatches: ReadonlyArray<AutolinkMatch>,
  showSyntax: boolean
): InlinePresentationPlan {
  const markRanges: InlinePresentationMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];

  for (const linkMatch of linkMatches) {
    markRanges.push({
      className: isSafeMarkdownLinkHref(linkMatch.href) ? 'cm-md-link-text' : 'cm-md-link-text cm-md-link-text-unsafe',
      from: linkMatch.labelFrom,
      to: linkMatch.labelTo,
      ...(isSafeMarkdownLinkHref(linkMatch.href) ? { attributes: { 'data-md-link-url': linkMatch.href } } : {})
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

export function collectEmbedPresentationPlan(
  embedMatches: ReadonlyArray<EmbedMatch>,
  showSyntax: boolean
): InlinePresentationPlan {
  const markRanges: InlinePresentationMarkRange[] = [];
  const replaceRanges: SemanticRange[] = [];

  for (const embedMatch of embedMatches) {
    markRanges.push({
      className: 'cm-md-link-text',
      from: embedMatch.labelFrom,
      to: embedMatch.labelTo,
      attributes: { 'data-md-embed-target': embedMatch.target }
    });

    for (const hiddenRange of embedMatch.hiddenRanges) {
      if (showSyntax) {
        markRanges.push({ className: 'cm-md-syntax-visible', from: hiddenRange.from, to: hiddenRange.to });
      } else {
        replaceRanges.push({ from: hiddenRange.from, to: hiddenRange.to });
      }
    }
  }

  return { markRanges, replaceRanges };
}

export function collectClozePlaceholderPresentationPlan(ranges: ReadonlyArray<SemanticRange>): InlinePresentationPlan {
  return {
    markRanges: ranges.map((range) => ({
      className: 'cm-md-cloze-placeholder',
      from: range.from,
      to: range.to
    })),
    replaceRanges: []
  };
}
