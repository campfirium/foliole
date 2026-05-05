import type { SemanticRange } from './inlineSemanticMarks';
import { collectMarkdownInlineLinkRanges } from './markdownInlineLinkProjection';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';
import {
  collectMarkdownEmbedRanges,
  collectMarkdownFootnoteRanges,
  collectMarkdownWikiLinkRanges
} from './markdownOblikeInlineProjection';

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
  hiddenRanges: RangeBounds[];
  href: string;
  labelFrom: number;
  labelTo: number;
}

export interface WikiLinkMatch extends RangeBounds {
  hiddenRanges: RangeBounds[];
  labelFrom: number;
  labelTo: number;
  title: string;
}

export interface EmbedMatch extends RangeBounds {
  hiddenRanges: RangeBounds[];
  labelFrom: number;
  labelTo: number;
  target: string;
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
  preservedRanges: ReadonlyArray<RangeBounds>,
  references: MarkdownLinkReferenceMap = new Map()
): InlineLinkMatch[] {
  return collectMarkdownInlineLinkRanges(text, from, references)
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
      hiddenRanges: match.syntaxRanges,
      href: match.href ?? match.text,
      labelFrom: match.contentFrom,
      labelTo: match.contentTo,
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

export function collectEmbedMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): EmbedMatch[] {
  return collectMarkdownEmbedRanges(text, from)
    .filter((match) => !isWithinRanges(match.from, match.to, preservedRanges))
    .map((match) => ({
      from: match.from,
      to: match.to,
      hiddenRanges: match.hiddenRanges,
      labelFrom: match.labelFrom,
      labelTo: match.labelTo,
      target: match.target
    }));
}

export function collectFootnoteMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): FootnoteMatch[] {
  return collectMarkdownFootnoteRanges(text, from)
    .filter((match) => !isWithinRanges(match.from, match.to, preservedRanges))
    .map((match) => ({
      from: match.from,
      label: match.label,
      note: match.note,
      to: match.to
    }));
}

export function toRangeBounds(ranges: ReadonlyArray<SemanticRange>): RangeBounds[] {
  return ranges.map((range) => ({ from: range.from, to: range.to }));
}
