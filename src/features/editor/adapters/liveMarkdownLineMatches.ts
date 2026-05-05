import { collectFootnoteMatches } from './liveMarkdownFootnotes';
import {
  collectImageMatches,
  collectInlineCodeMatches,
  collectInlineLinkMatches,
  collectWikiLinkDecorations,
  type RangeBounds
} from './liveMarkdownInlineDecorations';
import { collectClozePlaceholderRanges } from './liveMarkdownTextMarks';

interface MarkdownLineMatchState {
  clozePlaceholderRanges: RangeBounds[];
  footnoteRanges: RangeBounds[];
  imageMatches: ReturnType<typeof collectImageMatches>;
  inlineCodeMatches: ReturnType<typeof collectInlineCodeMatches>;
  inlineLinkMatches: ReturnType<typeof collectInlineLinkMatches>;
  wikiLinkMatches: ReturnType<typeof collectWikiLinkDecorations>;
  preservedRanges: RangeBounds[];
  footnoteMatches: ReturnType<typeof collectFootnoteMatches>;
}

export function collectPreviewLineMatchState(lineFrom: number, lineText: string, inCodeBlock: boolean): MarkdownLineMatchState {
  const clozePlaceholderRanges = collectClozePlaceholderRanges(lineFrom, lineText);
  const imageMatches = collectImageMatches(lineFrom, lineText);
  const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(lineFrom, lineText);
  const imageRanges = imageMatches.map((imageMatch) => ({ from: imageMatch.from, to: imageMatch.to }));
  const inlineCodeRanges = inlineCodeMatches.map((match) => ({ from: match.from, to: match.to }));
  const preservedRanges = clozePlaceholderRanges.concat(imageRanges, inlineCodeRanges);
  const footnoteMatches = inCodeBlock ? [] : collectFootnoteMatches(lineFrom, lineText, preservedRanges);
  const footnoteRanges = footnoteMatches.map((match) => ({ from: match.from, to: match.to }));
  const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(lineFrom, lineText, preservedRanges.concat(footnoteRanges));
  const wikiLinkMatches = inCodeBlock ? [] : collectWikiLinkDecorations(lineFrom, lineText, preservedRanges.concat(footnoteRanges));
  return { clozePlaceholderRanges, footnoteRanges, imageMatches, inlineCodeMatches, inlineLinkMatches, wikiLinkMatches, preservedRanges, footnoteMatches };
}

export function collectSourceLineMatchState(lineFrom: number, lineText: string, inCodeBlock: boolean): MarkdownLineMatchState {
  const clozePlaceholderRanges = collectClozePlaceholderRanges(lineFrom, lineText);
  const inlineCodeMatches = inCodeBlock ? [] : collectInlineCodeMatches(lineFrom, lineText);
  const preservedRanges = clozePlaceholderRanges.concat(inlineCodeMatches.map((match) => ({ from: match.from, to: match.to })));
  const footnoteMatches = inCodeBlock ? [] : collectFootnoteMatches(lineFrom, lineText, preservedRanges);
  const footnoteRanges = footnoteMatches.map((match) => ({ from: match.from, to: match.to }));
  const inlineLinkMatches = inCodeBlock ? [] : collectInlineLinkMatches(lineFrom, lineText, preservedRanges.concat(footnoteRanges));
  const wikiLinkMatches = inCodeBlock ? [] : collectWikiLinkDecorations(lineFrom, lineText, preservedRanges.concat(footnoteRanges));
  return {
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
