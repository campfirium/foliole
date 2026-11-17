import type { SyntaxNode } from '@lezer/common';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { collectImageMatchesFromTree } from './markdownImageMatches';
import { collectMarkdownLinkReferencesFromTree, normalizeMarkdownLinkReferenceLabel } from './markdownLinkReferences';

export interface ImageClipboardSource {
  from: number;
  to: number;
  markdown: string;
}

function children(node: SyntaxNode) {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function referenceTargets(root: SyntaxNode, content: string) {
  const targets = new Map<string, string>();
  function visit(node: SyntaxNode) {
    if (node.name === 'LinkReference') {
      const parts = children(node);
      const label = parts.find(part => part.name === 'LinkLabel');
      const url = parts.find(part => part.name === 'URL');
      if (label && url) {
        const key = normalizeMarkdownLinkReferenceLabel(content.slice(label.from, label.to));
        if (!targets.has(key)) targets.set(key, content.slice(url.from, node.to).trim());
      }
      return;
    }
    children(node).forEach(visit);
  }
  visit(root);
  return targets;
}

function inlineSource(node: SyntaxNode, content: string, targets: ReadonlyMap<string, string>) {
  const parts = children(node);
  if (parts.some(part => part.name === 'URL')) return content.slice(node.from, node.to);
  const marks = parts.filter(part => part.name === 'LinkMark');
  const opening = marks[0];
  const closing = marks[1];
  if (!opening || !closing) return null;
  const label = parts.find(part => part.name === 'LinkLabel');
  const key = (label ? normalizeMarkdownLinkReferenceLabel(content.slice(label.from, label.to)) : '') ||
    normalizeMarkdownLinkReferenceLabel(content.slice(opening.to, closing.from));
  const target = targets.get(key);
  return target ? `${content.slice(node.from, closing.to)}(${target})` : null;
}

function imageSource(node: SyntaxNode, content: string, targets: ReadonlyMap<string, string>): ImageClipboardSource | null {
  const markdown = inlineSource(node, content, targets);
  if (!markdown) return null;
  const parent = node.parent;
  if (parent?.name !== 'Link') return { from: node.from, to: node.to, markdown };
  const marks = children(parent).filter(part => part.name === 'LinkMark');
  if (!marks[0] || !marks[1] || content.slice(marks[0].to, node.from).trim() ||
    content.slice(node.to, marks[1].from).trim()) return { from: node.from, to: node.to, markdown };
  const outer = inlineSource(parent, content, targets);
  if (!outer) return null;
  const relativeFrom = node.from - parent.from;
  return { from: parent.from, to: parent.to,
    markdown: outer.slice(0, relativeFrom) + markdown + outer.slice(node.to - parent.from) };
}

export function getImageClipboardSource(content: string, from: number, to: number): ImageClipboardSource | null {
  const tree = folioleMarkdownParser.parse(content);
  const references = collectMarkdownLinkReferencesFromTree(tree, content);
  const match = collectImageMatchesFromTree(tree, 0, content, references).find(image => image.from === from && image.to === to);
  if (!match) return null;
  const images: SyntaxNode[] = [];
  function visit(node: SyntaxNode) {
    if (node.to <= from || node.from >= to) return;
    if (node.name === 'Image') { images.push(node); return; }
    children(node).forEach(visit);
  }
  visit(tree.topNode);
  if (images[0]) return imageSource(images[0], content, referenceTargets(tree.topNode, content));
  const raw = content.slice(from, to);
  return images.length === 0 && raw.startsWith('![[') ? { from, to, markdown: raw } : null;
}
