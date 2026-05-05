import {
  collectAutolinkMatches,
  collectFootnoteMatches,
  collectInlineCodeMatches,
  collectInlineLinkMatches,
  collectWikiLinkMatches,
  type AutolinkMatch,
  toRangeBounds,
  type FootnoteMatch,
  type InlineCodeMatch,
  type InlineLinkMatch,
  type RangeBounds,
  type WikiLinkMatch
} from './inlineMarkdownMatches';
import { collectClozePlaceholderRanges } from './inlineSemanticMarks';

export interface MarkdownLineMatchState {
  clozePlaceholderRanges: RangeBounds[];
  footnoteRanges: RangeBounds[];
  imageMatches: RangeBounds[];
  autolinkMatches: AutolinkMatch[];
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
  imageMatches: RangeBounds[]
): MarkdownLineMatchState {
  const clozePlaceholderRanges = toRangeBounds(collectClozePlaceholderRanges(lineFrom, lineText));
  const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(lineFrom, lineText);
  const inlineCodeRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
  const preservedRanges = clozePlaceholderRanges.concat(imageMatches, inlineCodeRanges);
  const footnoteMatches = inCodeBlock ? [] : collectFootnoteMatches(lineFrom, lineText, preservedRanges);
  const footnoteRanges = footnoteMatches.map((match) => ({ from: match.from, to: match.to }));
  const linkPreservedRanges = preservedRanges.concat(footnoteRanges);
  const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(lineFrom, lineText, linkPreservedRanges);
  const wikiLinkMatches = inCodeBlock ? [] : collectWikiLinkMatches(lineFrom, lineText, linkPreservedRanges);
  const linkRanges = [...inlineLinkMatches, ...wikiLinkMatches].map((match) => ({ from: match.from, to: match.to }));
  const autolinkMatches = inCodeBlock
    ? []
    : collectAutolinkMatches(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));

  return {
    autolinkMatches,
    clozePlaceholderRanges,
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
  inCodeBlock: boolean
): MarkdownLineMatchState {
  const clozePlaceholderRanges = toRangeBounds(collectClozePlaceholderRanges(lineFrom, lineText));
  const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(lineFrom, lineText);
  const preservedRanges = clozePlaceholderRanges.concat(inlineCodeMatches.map((match) => ({ from: match.from, to: match.to })));
  const footnoteMatches = inCodeBlock ? [] : collectFootnoteMatches(lineFrom, lineText, preservedRanges);
  const footnoteRanges = footnoteMatches.map((match) => ({ from: match.from, to: match.to }));
  const linkPreservedRanges = preservedRanges.concat(footnoteRanges);
  const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(lineFrom, lineText, linkPreservedRanges);
  const wikiLinkMatches = inCodeBlock ? [] : collectWikiLinkMatches(lineFrom, lineText, linkPreservedRanges);
  const linkRanges = [...inlineLinkMatches, ...wikiLinkMatches].map((match) => ({ from: match.from, to: match.to }));
  const autolinkMatches = inCodeBlock
    ? []
    : collectAutolinkMatches(lineFrom, lineText, linkPreservedRanges.concat(linkRanges));

  return {
    autolinkMatches,
    clozePlaceholderRanges,
    footnoteRanges,
    imageMatches: [],
    inlineCodeMatches,
    inlineLinkMatches,
    wikiLinkMatches,
    preservedRanges,
    footnoteMatches
  };
}
