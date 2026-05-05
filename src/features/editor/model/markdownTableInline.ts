import type { MarkdownInlineToken } from './markdownInlineProjectionTypes';
import { projectMarkdownInlineText } from './markdownInlineTextProjection';

export type MarkdownTableInlineToken = MarkdownInlineToken;

export function tokenizeMarkdownTableInlineText(text: string): MarkdownTableInlineToken[] {
  return projectMarkdownInlineText(text);
}
