import { ASSET_MARKDOWN_SCHEME, parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';
import {
  normalizeMarkdownLinkReferenceLabel,
  type MarkdownLinkReferenceMap
} from './markdownLinkReferences';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export interface MarkdownImageMatch {
  attachmentId: string | null;
  alt: string;
  display: 'block' | 'inline';
  from: number;
  source: string;
  to: number;
}

interface ParserImageMatch {
  altText: string;
  fullMatch: string;
  rawTarget: string;
  start: number;
}

function isBrowserImageSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'data:' || parsed.protocol === 'file:' || parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isInternalImageSource(value: string) {
  return value.startsWith(ASSET_MARKDOWN_SCHEME);
}

function resolveImageDisplay(text: string, matchIndex: number, raw: string) {
  const before = text.slice(0, matchIndex).trim();
  const after = text.slice(matchIndex + raw.length).trim();
  return before.length === 0 && after.length === 0 ? 'block' : 'inline';
}

function collectChildNodes(node: MarkdownSyntaxNode, name: string) {
  const nodes: MarkdownSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) nodes.push(child);
  }
  return nodes;
}

function normalizeImageUrl(rawTarget: string) {
  const trimmed = rawTarget.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed;
}

function normalizeAltText(source: string, from: number, to: number) {
  const inlineRanges = collectMarkdownInlineRanges(source.slice(from, to), from);
  let alt = '';
  let cursor = from;
  for (const range of inlineRanges.flatMap((item) => item.syntaxRanges).sort((left, right) => left.from - right.from)) {
    if (range.from > cursor) alt += source.slice(cursor, range.from);
    cursor = Math.max(cursor, range.to);
  }
  return `${alt}${source.slice(cursor, to)}`;
}

function resolveReferenceImageTarget(
  text: string,
  altFrom: number,
  altTo: number,
  label: MarkdownSyntaxNode | undefined,
  references: MarkdownLinkReferenceMap
) {
  const altText = text.slice(altFrom, altTo);
  const rawLabel = label ? text.slice(label.from, label.to) : altText;
  const normalizedLabel = normalizeMarkdownLinkReferenceLabel(rawLabel) || normalizeMarkdownLinkReferenceLabel(altText);
  return references.get(normalizedLabel) ?? null;
}

function createParserImageMatch(
  node: MarkdownSyntaxNode,
  text: string,
  references: MarkdownLinkReferenceMap
): ParserImageMatch | null {
  const marks = collectChildNodes(node, 'LinkMark');
  const url = collectChildNodes(node, 'URL')[0];
  const label = collectChildNodes(node, 'LinkLabel')[0];
  const altFrom = marks[0]?.to;
  const altTo = marks[1]?.from;
  if (altFrom === undefined || altTo === undefined) return null;
  const rawTarget = url ? text.slice(url.from, url.to) : resolveReferenceImageTarget(text, altFrom, altTo, label, references);
  if (!rawTarget) return null;
  const outerLink = resolveImageOnlyWrappingLink(node);
  const from = outerLink?.from ?? node.from;
  const to = outerLink?.to ?? node.to;
  return {
    altText: normalizeAltText(text, altFrom, altTo),
    fullMatch: text.slice(from, to),
    rawTarget: normalizeImageUrl(rawTarget),
    start: from
  };
}

function resolveImageOnlyWrappingLink(node: MarkdownSyntaxNode) {
  const parent = node.parent;
  if (parent?.name !== 'Link') return null;
  const marks = collectChildNodes(parent, 'LinkMark');
  const labelStart = marks[0]?.to;
  const labelEnd = marks[1]?.from;
  if (labelStart === node.from && labelEnd === node.to) {
    return parent;
  }
  return null;
}

function visitImageNodes(
  node: MarkdownSyntaxNode,
  text: string,
  matches: ParserImageMatch[],
  references: MarkdownLinkReferenceMap
) {
  if (node.name === 'Image') {
    const match = createParserImageMatch(node, text, references);
    if (match) matches.push(match);
    return;
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    visitImageNodes(child, text, matches, references);
  }
}

function collectParserImageMatches(text: string, references: MarkdownLinkReferenceMap) {
  const tree: MarkdownSyntaxTree = folioleMarkdownParser.parse(text);
  const matches: ParserImageMatch[] = [];
  visitImageNodes(tree.topNode, text, matches, references);
  return matches;
}

export function collectImageMatches(from: number, text: string, references: MarkdownLinkReferenceMap = new Map()): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];

  for (const match of collectParserImageMatches(text, references)) {
    const source = match.rawTarget;
    if (source && (isBrowserImageSource(source) || isInternalImageSource(source))) {
      const start = from + match.start;
      matches.push({
        attachmentId: isInternalImageSource(source) ? parseAssetMarkdownUrl(source) : null,
        alt: match.altText,
        display: resolveImageDisplay(text, match.start, match.fullMatch),
        from: start,
        source,
        to: start + match.fullMatch.length
      });
    }
  }

  return matches;
}
