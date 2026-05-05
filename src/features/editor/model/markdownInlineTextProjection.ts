import { collectMarkdownInlineLinkRanges, collectMarkdownInlineRanges } from './markdownInlineProjection';
import type { MarkdownInlineToken } from './markdownInlineProjectionTypes';
import { collectMarkdownFootnoteRanges, collectMarkdownWikiLinkRanges } from './markdownOblikeInlineProjection';

type MarkdownInlineTextCandidate =
  | { from: number; href?: string; kind: 'autolink'; text: string; to: number }
  | { from: number; kind: 'footnote'; label: string; note: string | null; to: number }
  | { from: number; kind: 'emphasis' | 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong'; text: string; to: number }
  | { from: number; href: string; kind: 'link'; text: string; to: number }
  | { from: number; kind: 'wikiLink'; text: string; title: string; to: number };

function collectInlineTextCandidates(text: string): MarkdownInlineTextCandidate[] {
  const markdownCandidates = collectMarkdownInlineRanges(text).map((range): MarkdownInlineTextCandidate => {
    if (range.kind === 'autolink') {
      return { from: range.from, href: range.href ?? range.text, kind: 'autolink', text: range.text, to: range.to };
    }
    return { from: range.from, kind: range.kind, text: range.text, to: range.to };
  });
  const footnoteCandidates = collectMarkdownFootnoteRanges(text).map((footnote): MarkdownInlineTextCandidate => ({
    from: footnote.from,
    kind: 'footnote',
    label: footnote.label,
    note: footnote.note,
    to: footnote.to
  }));
  const linkCandidates = collectMarkdownInlineLinkRanges(text).map((link): MarkdownInlineTextCandidate => ({
    from: link.from,
    href: link.href,
    kind: 'link',
    text: text.slice(link.labelFrom, link.labelTo),
    to: link.to
  }));
  const wikiCandidates = collectMarkdownWikiLinkRanges(text).map((link): MarkdownInlineTextCandidate => ({
    from: link.from,
    kind: 'wikiLink',
    text: text.slice(link.labelFrom, link.labelTo),
    title: link.title,
    to: link.to
  }));
  return [...markdownCandidates, ...footnoteCandidates, ...linkCandidates, ...wikiCandidates]
    .sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function projectMarkdownInlineText(text: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;

  for (const candidate of collectInlineTextCandidates(text)) {
    if (candidate.from < cursor) continue;
    if (candidate.from > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, candidate.from) });
    if (candidate.kind === 'autolink') {
      tokens.push({ href: candidate.href ?? candidate.text, kind: 'autolink', text: candidate.text });
    } else if (candidate.kind === 'footnote') {
      tokens.push({ kind: 'footnote', label: candidate.label, note: candidate.note });
    } else if (candidate.kind === 'link') {
      tokens.push({ href: candidate.href, kind: 'link', text: candidate.text });
    } else if (candidate.kind === 'wikiLink') {
      tokens.push({ kind: 'wikiLink', text: candidate.text, title: candidate.title });
    } else {
      tokens.push({ kind: candidate.kind, text: candidate.text });
    }
    cursor = candidate.to;
  }

  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens;
}
