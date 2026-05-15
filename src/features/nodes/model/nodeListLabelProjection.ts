import type { MarkdownInlineToken } from '../../editor/model/markdownInlineProjectionTypes';
import { projectMarkdownInlineText } from '../../editor/model/markdownInlineTextProjection';

const MAX_INLINE_PROJECTION_DEPTH = 3;

function stripMarkdownLinePrefix(value: string) {
  return value
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s*#{1,6}$/, '');
}

function stripMarkdownUrlNoise(value: string) {
  const stripped = value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:https?|asset):\/\/[^)]*\)/g, '$1')
    .replace(/\((?:https?|asset):\/\/[^)]*\)/g, '')
    .replace(/(?:https?|asset):\/\/\S+/g, '')
    .trim();
  return stripped || value;
}

function projectInlineTokenText(token: MarkdownInlineToken, depth: number): string {
  if (token.kind === 'footnote') return token.label;
  if (token.kind === 'text' || token.kind === 'link' || token.kind === 'unsafeLink' || token.kind === 'wikiLink' || token.kind === 'embed' || token.kind === 'autolink') {
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
  const cleaned = stripMarkdownLinePrefix(stripMarkdownUrlNoise(stripMarkdownLinePrefix(label)));
  return projectMarkdownInlinePlainText(cleaned).trim().replace(/\s+/g, ' ');
}
