import {
  collectAutolinkMatches,
  collectEmbedMatches,
  collectFootnoteMatches,
  collectInlineCodeMatches,
  collectInlineLinkMatches,
  collectWikiLinkMatches,
  type AutolinkMatch,
  type EmbedMatch,
  type FootnoteMatch,
  type InlineCodeMatch,
  type InlineLinkMatch,
  type RangeBounds,
  type WikiLinkMatch
} from './inlineMarkdownMatches';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';
import { collectMarkdownEscapedRanges } from './markdownLinkSafety';

export interface MarkdownLineMatchState {
  footnoteRanges: RangeBounds[];
  clozePlaceholderRanges: RangeBounds[];
  escapedRanges: RangeBounds[];
  imageMatches: RangeBounds[];
  autolinkMatches: AutolinkMatch[];
  embedMatches: EmbedMatch[];
  inlineCodeMatches: InlineCodeMatch[];
  inlineLinkMatches: InlineLinkMatch[];
  wikiLinkMatches: WikiLinkMatch[];
  preservedRanges: RangeBounds[];
  footnoteMatches: FootnoteMatch[];
}

function isWithinRanges(from: number, to: number, ranges: ReadonlyArray<RangeBounds>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) return true;
  }
  return false;
}

function collectClozePlaceholderRanges(lineFrom: number, lineText: string, preservedRanges: ReadonlyArray<RangeBounds>) {
  const ranges: RangeBounds[] = [];
  const placeholder = '[...]';
  let index = lineText.indexOf(placeholder);

  while (index !== -1) {
    const from = lineFrom + index;
    const to = from + placeholder.length;
    const escaped = index > 0 && lineText[index - 1] === '\\';
    if (!escaped && !isWithinRanges(from, to, preservedRanges)) {
      ranges.push({ from, to });
    }
    index = lineText.indexOf(placeholder, index + placeholder.length);
  }

  return ranges;
}

export function collectPreviewLineMatchState(
  lineFrom: number,
  lineText: string,
  inCodeBlock: boolean,
  imageMatches: RangeBounds[],
  references: MarkdownLinkReferenceMap = new Map()
): MarkdownLineMatchState {
  const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(lineFrom, lineText);
  const inlineCodeRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
  const preservedRanges = imageMatches.concat(inlineCodeRanges);
  const footnoteMatches = inCodeBlock ? [] : collectFootnoteMatches(lineFrom, lineText, preservedRanges);
  const footnoteRanges = footnoteMatches.map((match) => ({ from: match.from, to: match.to }));
  const linkPreservedRanges = preservedRanges.concat(footnoteRanges);
  const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(lineFrom, lineText, linkPreservedRanges, references);
  const wikiLinkMatches = inCodeBlock ? [] : collectWikiLinkMatches(lineFrom, lineText, linkPreservedRanges);
  const embedMatches = inCodeBlock ? [] : collectEmbedMatches(lineFrom, lineText, linkPreservedRanges);
  const linkRanges = [...inlineLinkMatches, ...wikiLinkMatches, ...embedMatches].map((match) => ({
    from: match.from,
    to: match.to
  }));
  const clozePlaceholderRanges = inCodeBlock
    ? []
    : collectClozePlaceholderRanges(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));
  const escapedRanges = inCodeBlock
    ? []
    : collectMarkdownEscapedRanges(lineText, lineFrom).filter(
        (match) => !isWithinRanges(match.from, match.to, linkPreservedRanges.concat(linkRanges))
      );
  const autolinkMatches = inCodeBlock
    ? []
    : collectAutolinkMatches(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));

  return {
    autolinkMatches,
    clozePlaceholderRanges,
    embedMatches,
    escapedRanges,
    footnoteRanges,
    imageMatches,
    inlineCodeMatches,
    inlineLinkMatches,
    wikiLinkMatches,
    preservedRanges,
    footnoteMatches
  };
}

export function collectSourceLineMatchState(
  lineFrom: number,
  lineText: string,
  inCodeBlock: boolean,
  references: MarkdownLinkReferenceMap = new Map()
): MarkdownLineMatchState {
  const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(lineFrom, lineText);
  const preservedRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
  const footnoteMatches = inCodeBlock ? [] : collectFootnoteMatches(lineFrom, lineText, preservedRanges);
  const footnoteRanges = footnoteMatches.map((match) => ({ from: match.from, to: match.to }));
  const linkPreservedRanges = preservedRanges.concat(footnoteRanges);
  const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(lineFrom, lineText, linkPreservedRanges, references);
  const wikiLinkMatches = inCodeBlock ? [] : collectWikiLinkMatches(lineFrom, lineText, linkPreservedRanges);
  const embedMatches = inCodeBlock ? [] : collectEmbedMatches(lineFrom, lineText, linkPreservedRanges);
  const linkRanges = [...inlineLinkMatches, ...wikiLinkMatches, ...embedMatches].map((match) => ({
    from: match.from,
    to: match.to
  }));
  const clozePlaceholderRanges = inCodeBlock
    ? []
    : collectClozePlaceholderRanges(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));
  const autolinkMatches = inCodeBlock
    ? []
    : collectAutolinkMatches(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));

  return {
    autolinkMatches,
    clozePlaceholderRanges,
    embedMatches,
    escapedRanges: [],
    footnoteRanges,
    imageMatches: [],
    inlineCodeMatches,
    inlineLinkMatches,
    wikiLinkMatches,
    preservedRanges,
    footnoteMatches
  };
}
