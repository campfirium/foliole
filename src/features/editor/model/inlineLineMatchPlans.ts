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

export interface MarkdownLineMatchState {
  footnoteRanges: RangeBounds[];
  imageMatches: RangeBounds[];
  autolinkMatches: AutolinkMatch[];
  embedMatches: EmbedMatch[];
  inlineCodeMatches: InlineCodeMatch[];
  inlineLinkMatches: InlineLinkMatch[];
  wikiLinkMatches: WikiLinkMatch[];
  preservedRanges: RangeBounds[];
  footnoteMatches: FootnoteMatch[];
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
  const autolinkMatches = inCodeBlock
    ? []
    : collectAutolinkMatches(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));

  return {
    autolinkMatches,
    embedMatches,
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
  const autolinkMatches = inCodeBlock
    ? []
    : collectAutolinkMatches(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));

  return {
    autolinkMatches,
    embedMatches,
    footnoteRanges,
    imageMatches: [],
    inlineCodeMatches,
    inlineLinkMatches,
    wikiLinkMatches,
    preservedRanges,
    footnoteMatches
  };
}
