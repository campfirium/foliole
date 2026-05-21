import { folioleMarkdownParser } from './folioleMarkdownParser';
import type { MarkdownSyntaxTree } from './markdownLinkReferences';
import type { MarkdownMathRange } from './markdownMathExtension';

type MarkdownSyntaxNode = MarkdownSyntaxTree['topNode'];

function collectChildNode(node: MarkdownSyntaxNode, name: string) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

function createMathRange(node: MarkdownSyntaxNode, source: string): MarkdownMathRange | null {
  if (node.name !== 'InlineMath' && node.name !== 'MathBlock') return null;
  const content = collectChildNode(node, 'MathContent');
  if (!content) return null;
  const tex = source.slice(content.from, content.to).trim();
  if (!tex) return null;
  return {
    display: node.name === 'MathBlock' ? 'block' : 'inline',
    from: node.from,
    source: source.slice(node.from, node.to),
    tex,
    texFrom: content.from,
    texTo: content.to,
    to: node.to
  };
}

function visitMathRanges(node: MarkdownSyntaxNode, source: string, ranges: MarkdownMathRange[]) {
  const range = createMathRange(node, source);
  if (range) {
    ranges.push(range);
    return;
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    visitMathRanges(child, source, ranges);
  }
}

export function collectMarkdownMathRangesFromTree(tree: MarkdownSyntaxTree, source: string): MarkdownMathRange[] {
  const ranges: MarkdownMathRange[] = [];
  visitMathRanges(tree.topNode, source, ranges);
  return ranges.sort((left, right) => left.from - right.from);
}

export function collectMarkdownMathRanges(source: string): MarkdownMathRange[] {
  return collectMarkdownMathRangesFromTree(folioleMarkdownParser.parse(source), source);
}
