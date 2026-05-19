import { folioleMarkdownParser } from './folioleMarkdownParser';
import { normalizeMarkdownLinkDestination } from './markdownLinkSafety';

export type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export type MarkdownLinkReferenceMap = ReadonlyMap<string, string>;

export interface MarkdownLinkReferenceRange {
  from: number;
  lineFrom: number;
  to: number;
}

function collectChildNode(node: MarkdownSyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function collapseWhitespace(value: string) {
  return value.trim().split(/\s+/).join(' ');
}

export function normalizeMarkdownLinkReferenceLabel(label: string) {
  const trimmed = label.trim();
  const content = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return collapseWhitespace(content).toLowerCase();
}

function normalizeReferenceUrl(rawUrl: string) {
  return normalizeMarkdownLinkDestination(rawUrl);
}

function findLineFrom(source: string, position: number) {
  return source.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
}

function visitLinkReferenceRanges(
  node: MarkdownSyntaxNode,
  source: string,
  ranges: MarkdownLinkReferenceRange[]
) {
  if (node.name === 'LinkReference') {
    ranges.push({
      from: node.from,
      lineFrom: findLineFrom(source, node.from),
      to: node.to
    });
    return;
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    visitLinkReferenceRanges(child, source, ranges);
  }
}

function visitLinkReferences(node: MarkdownSyntaxNode, source: string, references: Map<string, string>) {
  if (node.name === 'LinkReference') {
    const label = collectChildNode(node, 'LinkLabel');
    const url = collectChildNode(node, 'URL');
    if (label && url) {
      const normalizedLabel = normalizeMarkdownLinkReferenceLabel(source.slice(label.from, label.to));
      const normalizedUrl = normalizeReferenceUrl(source.slice(url.from, url.to));
      if (normalizedLabel && normalizedUrl && !references.has(normalizedLabel)) {
        references.set(normalizedLabel, normalizedUrl);
      }
    }
    return;
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    visitLinkReferences(child, source, references);
  }
}

export function collectMarkdownLinkReferencesFromTree(tree: MarkdownSyntaxTree, text: string): MarkdownLinkReferenceMap {
  const references = new Map<string, string>();
  visitLinkReferences(tree.topNode, text, references);
  return references;
}

export function collectMarkdownLinkReferenceRangesFromTree(tree: MarkdownSyntaxTree, text: string): MarkdownLinkReferenceRange[] {
  const ranges: MarkdownLinkReferenceRange[] = [];
  visitLinkReferenceRanges(tree.topNode, text, ranges);
  return ranges.sort((left, right) => left.from - right.from);
}

export function collectMarkdownLinkReferences(text: string): MarkdownLinkReferenceMap {
  return collectMarkdownLinkReferencesFromTree(folioleMarkdownParser.parse(text), text);
}

export function collectMarkdownLinkReferenceRanges(text: string): MarkdownLinkReferenceRange[] {
  return collectMarkdownLinkReferenceRangesFromTree(folioleMarkdownParser.parse(text), text);
}
