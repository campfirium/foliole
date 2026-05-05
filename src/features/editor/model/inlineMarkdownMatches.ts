import type { SemanticRange } from './inlineSemanticMarks';
import { collectMarkdownInlineLinkRanges, collectMarkdownInlineRanges } from './markdownInlineProjection';
import { collectMarkdownWikiLinkRanges } from './markdownOblikeInlineProjection';

const FOOTNOTE_PATTERN = /\^\[(?<label>[^\]\n]+)\](?:\{(?<note>(?:\\.|[^}\n])*)\})?/g;

export interface RangeBounds {
  from: number;
  to: number;
}

export interface InlineCodeMatch extends RangeBounds {
  contentFrom: number;
  contentTo: number;
}

export interface InlineLinkMatch extends RangeBounds {
  labelFrom: number;
  labelTo: number;
  hiddenRanges: RangeBounds[];
  href: string;
}

export interface AutolinkMatch extends RangeBounds {
  href: string;
}

export interface WikiLinkMatch extends RangeBounds {
  hiddenRanges: RangeBounds[];
  labelFrom: number;
  labelTo: number;
  title: string;
}

export interface FootnoteMatch extends RangeBounds {
  label: string;
  note: string | null;
}

function isWithinRanges(from: number, to: number, ranges: ReadonlyArray<RangeBounds>) {
  for (const range of ranges) {
    if (from < range.to && to > range.from) {
      return true;
    }
  }
  return false;
}

export function collectInlineCodeMatches(from: number, text: string): InlineCodeMatch[] {
  return collectMarkdownInlineRanges(text, from)
    .filter((match) => match.kind === 'inlineCode')
    .map((match) => ({
      from: match.from,
      to: match.to,
      contentFrom: match.contentFrom,
      contentTo: match.contentTo
    }));
}

export function collectInlineLinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): InlineLinkMatch[] {
  return collectMarkdownInlineLinkRanges(text, from)
    .filter((match) => !isWithinRanges(match.from, match.to, preservedRanges))
    .map((match) => ({
      from: match.from,
      to: match.to,
      labelFrom: match.labelFrom,
      labelTo: match.labelTo,
      hiddenRanges: match.hiddenRanges,
      href: match.href
    }));
}

export function collectAutolinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): AutolinkMatch[] {
  return collectMarkdownInlineRanges(text, from)
    .filter((match) => match.kind === 'autolink' && !isWithinRanges(match.from, match.to, preservedRanges))
    .map((match) => ({
      from: match.from,
      href: match.href ?? match.text,
      to: match.to
    }));
}

export function collectWikiLinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): WikiLinkMatch[] {
  return collectMarkdownWikiLinkRanges(text, from)
    .filter((match) => !isWithinRanges(match.from, match.to, preservedRanges))
    .map((match) => ({
      from: match.from,
      to: match.to,
      hiddenRanges: match.hiddenRanges,
      labelFrom: match.labelFrom,
      labelTo: match.labelTo,
      title: match.title
    }));
}

export function collectFootnoteMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): FootnoteMatch[] {
  const matches: FootnoteMatch[] = [];
  let match = FOOTNOTE_PATTERN.exec(text);

  while (match) {
    const start = from + match.index;
    const fullText = match[0] ?? '';
    const end = start + fullText.length;
    if (!isWithinRanges(start, end, preservedRanges)) {
      matches.push({
        from: start,
        label: (match.groups?.label ?? '').trim(),
        note: unescapeFootnoteText(match.groups?.note ?? null),
        to: end
      });
    }
    match = FOOTNOTE_PATTERN.exec(text);
  }

  FOOTNOTE_PATTERN.lastIndex = 0;
  return matches;
}

export function toRangeBounds(ranges: ReadonlyArray<SemanticRange>): RangeBounds[] {
  return ranges.map((range) => ({ from: range.from, to: range.to }));
}

function unescapeFootnoteText(note: string | null) {
  if (!note) {
    return null;
  }
  return note.replace(/\\([\\}])/g, '$1').trim() || null;
}
