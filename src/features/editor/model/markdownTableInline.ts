import { projectMarkdownInlineText } from './markdownInlineProjection';
import type { MarkdownInlineToken } from './markdownInlineProjectionTypes';

export type MarkdownTableInlineToken = MarkdownInlineToken;

export function tokenizeMarkdownTableInlineText(text: string): MarkdownTableInlineToken[] {
  return projectMarkdownInlineText(text);
}
