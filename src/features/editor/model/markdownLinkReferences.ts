import { folioleMarkdownParser } from './folioleMarkdownParser';

type MarkdownSyntaxTree = ReturnType<typeof folioleMarkdownParser.parse>;
type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

export type MarkdownLinkReferenceMap = ReadonlyMap<string, string>;

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
  const trimmed = rawUrl.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed;
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

export function collectMarkdownLinkReferences(text: string): MarkdownLinkReferenceMap {
  const tree: MarkdownSyntaxTree = folioleMarkdownParser.parse(text);
  const references = new Map<string, string>();
  visitLinkReferences(tree.topNode, text, references);
  return references;
}
