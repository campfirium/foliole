import { collectMarkdownForumTitleLinkRanges } from './markdownForumTitleLinkProjection';
import { collectMarkdownInlineLinkRanges } from './markdownInlineLinkProjection';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';
import type { MarkdownInlineToken } from './markdownInlineProjectionTypes';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';
import { isSafeMarkdownLinkHref } from './markdownLinkSafety';
import {
  collectMarkdownEmbedRanges,
  collectMarkdownFootnoteRanges,
  collectMarkdownWikiLinkRanges
} from './markdownOblikeInlineProjection';

type MarkdownInlineTextCandidate =
  | { from: number; href?: string; kind: 'autolink'; text: string; to: number }
  | { from: number; kind: 'footnote'; label: string; note: string | null; to: number }
  | { from: number; kind: 'embed'; target: string; text: string; to: number }
  | { from: number; kind: 'emphasis' | 'inlineCode' | 'sourceHighlight' | 'strikethrough' | 'strong'; text: string; to: number }
  | { from: number; href: string; kind: 'link'; text: string; to: number }
  | { from: number; href: string; kind: 'forumTitleLink'; text: string; to: number }
  | { from: number; kind: 'wikiLink'; text: string; title: string; to: number };

function collectInlineTextCandidates(text: string, references: MarkdownLinkReferenceMap): MarkdownInlineTextCandidate[] {
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
  const linkCandidates = collectMarkdownInlineLinkRanges(text, 0, references).map((link): MarkdownInlineTextCandidate => ({
    from: link.from,
    href: link.href,
    kind: 'link',
    text: link.labelText,
    to: link.to
  }));
  const forumTitleLinkCandidates = collectMarkdownForumTitleLinkRanges(text).map((link): MarkdownInlineTextCandidate => ({
    from: link.from,
    href: link.href,
    kind: 'forumTitleLink',
    text: link.labelText,
    to: link.to
  }));
  const wikiCandidates = collectMarkdownWikiLinkRanges(text).map((link): MarkdownInlineTextCandidate => ({
    from: link.from,
    kind: 'wikiLink',
    text: text.slice(link.labelFrom, link.labelTo),
    title: link.title,
    to: link.to
  }));
  const embedCandidates = collectMarkdownEmbedRanges(text).map((embed): MarkdownInlineTextCandidate => ({
    from: embed.from,
    kind: 'embed',
    target: embed.target,
    text: text.slice(embed.labelFrom, embed.labelTo),
    to: embed.to
  }));
  return [...markdownCandidates, ...footnoteCandidates, ...linkCandidates, ...forumTitleLinkCandidates, ...wikiCandidates, ...embedCandidates]
    .sort((left, right) => (left.from === right.from ? right.to - left.to : left.from - right.from));
}

export function projectMarkdownInlineText(text: string, references: MarkdownLinkReferenceMap = new Map()): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;

  for (const candidate of collectInlineTextCandidates(text, references)) {
    if (candidate.from < cursor) continue;
    if (candidate.from > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, candidate.from) });
    if (candidate.kind === 'autolink') {
      const href = candidate.href ?? candidate.text;
      if (isSafeMarkdownLinkHref(href)) {
        tokens.push({ href, kind: 'autolink', text: candidate.text });
      } else {
        tokens.push({ kind: 'unsafeLink', text: candidate.text });
      }
    } else if (candidate.kind === 'footnote') {
      tokens.push({ kind: 'footnote', label: candidate.label, note: candidate.note });
    } else if (candidate.kind === 'link' || candidate.kind === 'forumTitleLink') {
      if (isSafeMarkdownLinkHref(candidate.href)) {
        tokens.push({ href: candidate.href, kind: 'link', text: candidate.text });
      } else {
        tokens.push({ kind: 'unsafeLink', text: candidate.text });
      }
    } else if (candidate.kind === 'wikiLink') {
      tokens.push({ kind: 'wikiLink', text: candidate.text, title: candidate.title });
    } else if (candidate.kind === 'embed') {
      tokens.push({ kind: 'embed', target: candidate.target, text: candidate.text });
    } else {
      tokens.push({ kind: candidate.kind, text: candidate.text });
    }
    cursor = candidate.to;
  }

  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens;
}
