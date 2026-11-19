import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

import type { SuperMemoBibliography } from './superMemoBibliography.js';

type Node = DefaultTreeAdapterTypes.ChildNode;

const referenceKeys = new Map<string, keyof SuperMemoBibliography>([
  ['title', 'title'], ['author', 'author'], ['link', 'url'], ['date', 'date'],
  ['source', 'publisher'], ['comment', 'comment']
]);

function referenceText(node: Node, prefix = ''): string {
  if ('value' in node) return node.value;
  if (!('tagName' in node)) return '';
  if (node.tagName === 'br') return '\n';
  const children = node.childNodes.reduce((text, child) => text + referenceText(child, prefix + text), '');
  if (node.tagName === 'a') {
    const href = node.attrs.find(attribute => attribute.name === 'href')?.value;
    if (href && /(?:^|\n)\s*#\s*link\s*:\s*$/iu.test(prefix)) return href;
    if (href && /^\s*#\s*link\s*:/iu.test(children)) return `#Link: ${href}`;
  }
  return /^(div|p|h[1-6])$/u.test(node.tagName) ? `\n${children}\n` : children;
}

function collectReferences(nodes: Node[], result: SuperMemoBibliography) {
  for (const node of nodes) {
    if (!('tagName' in node)) continue;
    if (node.tagName !== 'supermemoreference') {
      collectReferences(node.childNodes, result);
      continue;
    }
    for (const line of referenceText(node).split(/\r?\n/u)) {
      const match = /^\s*#\s*([a-z]+):\s*(.*?)\s*$/iu.exec(line);
      const key = match && referenceKeys.get(match[1]!.toLowerCase());
      if (key && match[2]) result[key] ??= match[2];
    }
  }
}

export function readSuperMemoXmlReferences(parts: string[]): SuperMemoBibliography | undefined {
  const result: SuperMemoBibliography = {};
  for (const part of parts) {
    if (/<supermemoreference\b/iu.test(part)) collectReferences(parseFragment(part).childNodes, result);
  }
  return Object.keys(result).length ? result : undefined;
}
