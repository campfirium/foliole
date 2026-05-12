import type { MarkdownInlineToken } from '../../editor/model/markdownInlineProjectionTypes';
import { projectMarkdownInlineText } from '../../editor/model/markdownInlineTextProjection';

const MAX_INLINE_PROJECTION_DEPTH = 3;

function stripMarkdownLinePrefix(value: string) {
  return value
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '');
}

function projectInlineTokenText(token: MarkdownInlineToken, depth: number): string {
  if (token.kind === 'footnote') return token.label;
  if (token.kind === 'text' || token.kind === 'link' || token.kind === 'wikiLink' || token.kind === 'embed' || token.kind === 'autolink') {
    return token.text;
  }
  return projectMarkdownInlinePlainText(token.text, depth + 1);
}

function projectMarkdownInlinePlainText(value: string, depth = 0): string {
  if (depth >= MAX_INLINE_PROJECTION_DEPTH) return value;
  return projectMarkdownInlineText(value)
    .map((token) => projectInlineTokenText(token, depth))
    .join('');
}

export function projectNodeListLabel(label: string) {
  return projectMarkdownInlinePlainText(stripMarkdownLinePrefix(label)).trim().replace(/\s+/g, ' ');
}
