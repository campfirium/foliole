import type { SemanticRange } from './inlineSemanticMarks';

const INLINE_LINK_PATTERN = /(?<!!)\[([^\]\n]*)\]\(([^)\n]*)\)/g;
const WIKI_LINK_PATTERN = /(?<!!)\[\[([^\]\n]+)\]\]/g;
const FOOTNOTE_PATTERN = /\^\[(?<label>[^\]\n]+)\](?:\{(?<note>(?:\\.|[^}\n])*)\})?/g;
const AUTOLINK_PATTERN = /\b(?:https?:\/\/[^\s<>()\]]+|www\.[^\s<>()\]]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const AUTOLINK_TRAILING_PUNCTUATION_PATTERN = /[.,;:!?]+$/;

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
  const matches: InlineCodeMatch[] = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '`') {
      index += 1;
      continue;
    }
    const openerStart = index;
    while (index < text.length && text[index] === '`') index += 1;
    const delimiterLength = index - openerStart;
    const openerEnd = index;

    let cursor = openerEnd;
    let foundClosing = false;
    while (cursor < text.length) {
      if (text[cursor] !== '`') {
        cursor += 1;
        continue;
      }
      const closerStart = cursor;
      while (cursor < text.length && text[cursor] === '`') cursor += 1;
      const closerLength = cursor - closerStart;
      if (closerLength !== delimiterLength) continue;
      matches.push({
        from: from + openerStart,
        to: from + cursor,
        contentFrom: from + openerEnd,
        contentTo: from + closerStart
      });
      foundClosing = true;
      break;
    }
    if (!foundClosing) index = openerEnd;
  }
  return matches;
}

export function collectInlineLinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): InlineLinkMatch[] {
  const matches: InlineLinkMatch[] = [];
  let match = INLINE_LINK_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    const fullText = match[0] ?? '';
    const label = match[1] ?? '';
    const labelFrom = start + 1;
    const labelTo = labelFrom + label.length;
    const pairFrom = labelTo;
    const pairTo = pairFrom + 2;
    const linkTo = start + fullText.length;

    if (!isWithinRanges(start, linkTo, preservedRanges)) {
      const urlFrom = pairTo;
      const urlTo = linkTo - 1;
      matches.push({
        from: start,
        to: linkTo,
        labelFrom,
        labelTo,
        hiddenRanges: [
          { from: start, to: start + 1 },
          { from: pairFrom, to: pairTo },
          { from: urlFrom, to: urlTo },
          { from: linkTo - 1, to: linkTo }
        ],
        href: match[2] ?? ''
      });
    }
    match = INLINE_LINK_PATTERN.exec(text);
  }
  INLINE_LINK_PATTERN.lastIndex = 0;
  return matches;
}

export function collectAutolinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): AutolinkMatch[] {
  const matches: AutolinkMatch[] = [];
  let match = AUTOLINK_PATTERN.exec(text);
  while (match) {
    const rawText = match[0] ?? '';
    const linkText = rawText.replace(AUTOLINK_TRAILING_PUNCTUATION_PATTERN, '');
    const start = from + match.index;
    const end = start + linkText.length;
    if (linkText && !isWithinRanges(start, end, preservedRanges)) {
      matches.push({ from: start, href: normalizeAutolinkHref(linkText), to: end });
    }
    match = AUTOLINK_PATTERN.exec(text);
  }
  AUTOLINK_PATTERN.lastIndex = 0;
  return matches;
}

function normalizeAutolinkHref(text: string) {
  if (text.startsWith('www.')) return `https://${text}`;
  if (text.includes('@') && !text.includes('://')) return `mailto:${text}`;
  return text;
}

export function collectWikiLinkMatches(
  from: number,
  text: string,
  preservedRanges: ReadonlyArray<RangeBounds>
): WikiLinkMatch[] {
  const matches: WikiLinkMatch[] = [];
  let match = WIKI_LINK_PATTERN.exec(text);
  while (match) {
    const start = from + match.index;
    const title = (match[1] ?? '').trim();
    const linkTo = start + (match[0]?.length ?? 0);
    const labelFrom = start + 2;
    const labelTo = linkTo - 2;

    if (title && !isWithinRanges(start, linkTo, preservedRanges)) {
      matches.push({
        from: start,
        to: linkTo,
        hiddenRanges: [
          { from: start, to: start + 2 },
          { from: linkTo - 2, to: linkTo }
        ],
        labelFrom,
        labelTo,
        title
      });
    }
    match = WIKI_LINK_PATTERN.exec(text);
  }
  WIKI_LINK_PATTERN.lastIndex = 0;
  return matches;
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
