import type { folioleMarkdownParser } from './folioleMarkdownParser.js';
import { normalizeMarkdownReferenceLabel as normalizeLabel } from './markdownReferenceLabel.js';

type Tree = ReturnType<typeof folioleMarkdownParser.parse>;
type SyntaxNode = Tree['topNode'];

export interface MarkdownReferenceDefinition {
  from: number;
  raw: string;
  title: string;
  to: number;
}

/** Definitions by normalized label; as in Markdown, the first definition of a label wins. */
export function collectMarkdownReferenceDefinitions(tree: Tree, content: string) {
  const definitions = new Map<string, MarkdownReferenceDefinition>();
  tree.iterate({ enter(node) {
    if (node.name !== 'LinkReference') return;
    const label = node.node.getChild('LinkLabel');
    const url = node.node.getChild('URL');
    const title = node.node.getChild('LinkTitle');
    if (!label || !url) return;
    const key = normalizeLabel(content.slice(label.from, label.to));
    if (!definitions.has(key)) definitions.set(key, {
      from: node.from, to: node.to,
      raw: content.slice(url.from, url.to), title: title ? content.slice(title.from, title.to) : ''
    });
  } });
  return definitions;
}

/** Resolves a reference-style `Link` or `Image` node (one without its own URL). */
export function resolveMarkdownReference(node: SyntaxNode, content: string,
  definitions: ReturnType<typeof collectMarkdownReferenceDefinitions>) {
  const marks = node.getChildren('LinkMark');
  if (!marks[0] || !marks[1]) return null;
  const text = content.slice(marks[0].to, marks[1].from);
  const label = node.getChild('LinkLabel');
  const key = normalizeLabel(label ? content.slice(label.from, label.to) : text) || normalizeLabel(text);
  const definition = definitions.get(key);
  return definition ? { ...definition, key, text } : null;
}
