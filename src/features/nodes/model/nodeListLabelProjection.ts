import { projectImageOnlyMarkdownLabel } from '../../../../lib/core/import/markdownImageLabel';
import type { MarkdownInlineToken } from '../../editor/model/markdownInlineProjectionTypes';
import { projectMarkdownInlineText } from '../../editor/model/markdownInlineTextProjection';

const MAX_INLINE_PROJECTION_DEPTH = 3;

function stripMarkdownLinePrefix(value: string) {
  return value
    .trim()
    .replace(/(^|[.\s])#{1,6}\s+/g, '$1')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s*#{1,6}$/, '');
}

function stripBoundaryStrongMarkers(value: string) {
  return value
    .replace(/^\*\*(?=\S)/, '')
    .replace(/\s+\*\*$/, '')
    .replace(/(?<=\S)\*\*$/, '');
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

function unescapeMarkdownPunctuation(value: string) {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
}

function stripTruncatedMarkdownFragments(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*$/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*$/g, '$1')
    .replace(/\*\*/g, '');
}

export function projectMarkdownDisplayText(label: string) {
  const imageOnlyLabel = projectImageOnlyMarkdownLabel(label);
  if (imageOnlyLabel) {
    return imageOnlyLabel;
  }
  const cleaned = stripMarkdownLinePrefix(stripMarkdownUrlNoise(stripMarkdownLinePrefix(label)));
  return unescapeMarkdownPunctuation(stripTruncatedMarkdownFragments(stripBoundaryStrongMarkers(projectMarkdownInlinePlainText(cleaned))))
    .replace(/\[\^([^\]]+)\]/g, '$1')
    .trim()
    .replace(/\s+/g, ' ');
}

export const projectNodeListLabel = projectMarkdownDisplayText;
