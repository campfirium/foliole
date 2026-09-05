import { parseAssetMarkdownUrl } from '../../../../lib/platform/assetMarkdownUrl';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { parseMarkdownImageLabelSize } from './markdownImageSize';
import { isBrowserImageSource, isInternalImageSource, isRelativeImageSource } from './markdownImageSourceKinds';
import type { MarkdownImageMatch } from './markdownImageTypes';
import { resolveMarkdownImageWrappingLink } from './markdownImageWrappingLink';
import { collectMarkdownInlineRanges } from './markdownInlineProjection';
import {
  normalizeMarkdownLinkReferenceLabel,
  type MarkdownLinkReferenceMap,
  type MarkdownSyntaxTree
} from './markdownLinkReferences';
import { isSafeMarkdownLinkHref, normalizeMarkdownLinkDestination } from './markdownLinkSafety';

export type { MarkdownImageMatch } from './markdownImageTypes';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];
const BRACKETED_ALT_IMAGE_PREFIX = '![[';

interface ParserImageMatch {
  altText: string;
  fullMatch: string;
  linkHref?: string;
  rawTarget: string;
  start: number;
}

function findLineEnd(text: string, position: number) {
  const newline = text.indexOf('\n', position);
  return newline < 0 ? text.length : newline;
}

function findLineStart(text: string, position: number) {
  return text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function resolveImageDisplay(text: string, matchIndex: number, raw: string) {
  const lineStart = findLineStart(text, matchIndex);
  const lineEnd = findLineEnd(text, matchIndex + raw.length);
  const before = text.slice(lineStart, matchIndex).trim();
  const after = text.slice(matchIndex + raw.length, lineEnd).trim();
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

function normalizeBracketedAltText(value: string) {
  const aliasIndex = value.lastIndexOf('|');
  const label = aliasIndex >= 0 ? value.slice(aliasIndex + 1) : value;
  return label.trim() || value.trim();
}

function findInlineClosingParen(text: string, from: number) {
  let escaped = false;
  for (let cursor = from; cursor < text.length; cursor += 1) {
    const character = text[cursor] ?? '';
    if (character === '\n') return -1;
    if (!escaped && character === ')') return cursor;
    escaped = !escaped && character === '\\';
  }
  return -1;
}

function createBracketedAltImageMatch(text: string, start: number): ParserImageMatch | null {
  const altFrom = start + BRACKETED_ALT_IMAGE_PREFIX.length;
  const altTo = text.indexOf(']]', altFrom);
  if (altTo < 0 || text[altTo + 2] !== '(') return null;
  const targetFrom = altTo + 3;
  const targetTo = findInlineClosingParen(text, targetFrom);
  if (targetTo < 0) return null;
  return {
    altText: normalizeBracketedAltText(text.slice(altFrom, altTo)),
    fullMatch: text.slice(start, targetTo + 1),
    rawTarget: normalizeImageUrl(text.slice(targetFrom, targetTo)),
    start
  };
}

function collectBracketedAltImageMatches(text: string) {
  const matches: ParserImageMatch[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(BRACKETED_ALT_IMAGE_PREFIX, cursor);
    if (start < 0) break;
    const match = createBracketedAltImageMatch(text, start);
    if (match) matches.push(match);
    cursor = match ? match.start + match.fullMatch.length : start + 3;
  }
  return matches;
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
  const outerLink =
    resolveImageOnlyWrappingLink(node, text) ??
    resolveMarkdownImageWrappingLink(text, node.from, node.to);
  const from = outerLink?.from ?? node.from;
  const to = outerLink?.to ?? node.to;
  return {
    altText: normalizeAltText(text, altFrom, altTo),
    fullMatch: text.slice(from, to),
    ...(outerLink?.target && isSafeMarkdownLinkHref(outerLink.target) ? { linkHref: normalizeMarkdownLinkDestination(outerLink.target) } : {}),
    rawTarget: normalizeImageUrl(rawTarget),
    start: from
  };
}

function resolveImageOnlyWrappingLink(node: MarkdownSyntaxNode, text: string) {
  const parent = node.parent;
  if (parent?.name !== 'Link') return null;
  const marks = collectChildNodes(parent, 'LinkMark');
  const url = collectChildNodes(parent, 'URL')[0];
  const labelStart = marks[0]?.to;
  const labelEnd = marks[1]?.from;
  if (labelStart === undefined || labelEnd === undefined) return null;
  if (text.slice(labelStart, node.from).trim().length === 0) {
    return {
      from: parent.from,
      target: url ? text.slice(url.from, url.to) : null,
      to: parent.to
    };
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

function collectParserImageMatchesFromTree(tree: MarkdownSyntaxTree, text: string, references: MarkdownLinkReferenceMap) {
  const matches: ParserImageMatch[] = [];
  visitImageNodes(tree.topNode, text, matches, references);
  return [...matches, ...collectBracketedAltImageMatches(text)].sort((left, right) => left.start - right.start);
}

export function collectImageMatches(
  from: number,
  text: string,
  references: MarkdownLinkReferenceMap = new Map(),
  options: { allowRelativeImages?: boolean } = {}
): MarkdownImageMatch[] {
  return collectImageMatchesFromTree(folioleMarkdownParser.parse(text), from, text, references, options);
}

export function collectImageMatchesFromTree(
  tree: MarkdownSyntaxTree,
  from: number,
  text: string,
  references: MarkdownLinkReferenceMap = new Map(),
  options: { allowRelativeImages?: boolean } = {}
): MarkdownImageMatch[] {
  const matches: MarkdownImageMatch[] = [];

  for (const match of collectParserImageMatchesFromTree(tree, text, references)) {
    const source = match.rawTarget;
    const label = parseMarkdownImageLabelSize(match.altText);
    if (
      source &&
      (isBrowserImageSource(source) || isInternalImageSource(source) || (options.allowRelativeImages && isRelativeImageSource(source)))
    ) {
      const start = from + match.start;
      matches.push({
        attachmentId: isInternalImageSource(source) ? parseAssetMarkdownUrl(source) : null,
        alt: label.alt,
        display: resolveImageDisplay(text, match.start, match.fullMatch),
        ...(label.displayWidth ? { displayWidth: label.displayWidth } : {}),
        from: start,
        ...(match.linkHref ? { linkHref: match.linkHref } : {}),
        source,
        to: start + match.fullMatch.length
      });
    }
  }

  return matches;
}
