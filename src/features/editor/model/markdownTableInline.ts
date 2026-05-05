import type { MarkdownInlineToken } from './markdownInlineProjectionTypes';
import { projectMarkdownInlineText } from './markdownInlineTextProjection';
import type { MarkdownLinkReferenceMap } from './markdownLinkReferences';

export type MarkdownTableInlineToken = MarkdownInlineToken;

export function tokenizeMarkdownTableInlineText(
  text: string,
  references: MarkdownLinkReferenceMap = new Map()
): MarkdownTableInlineToken[] {
  return projectMarkdownInlineText(text, references);
}
