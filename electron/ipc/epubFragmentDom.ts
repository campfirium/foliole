import { serializeOuter } from 'parse5';

import { isHtmlElement, type HtmlElement, type HtmlNode } from './epubParse5.js';

const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul'
]);

function getAttribute(node: HtmlElement, name: string) {
  return node.attrs.find((attribute) => attribute.name === name)?.value ?? null;
}

function hasBlockChild(node: HtmlElement) {
  return node.childNodes.some((child) => isHtmlElement(child) && BLOCK_TAGS.has(child.tagName));
}

export function findBody(node: HtmlNode): HtmlElement | null {
  if (isHtmlElement(node) && node.tagName === 'body') {
    return node;
  }
  if (!('childNodes' in node)) {
    return null;
  }
  for (const child of node.childNodes) {
    const body = findBody(child);
    if (body) return body;
  }
  return null;
}

export function collectRenderableBlocks(nodes: HtmlNode[], blocks: HtmlNode[] = []) {
  for (const node of nodes) {
    if (isHtmlElement(node) && BLOCK_TAGS.has(node.tagName)) {
      if (hasBlockChild(node) && !['table', 'ul', 'ol'].includes(node.tagName)) {
        collectRenderableBlocks(node.childNodes, blocks);
      } else {
        blocks.push(node);
      }
      continue;
    }
    if ('childNodes' in node) {
      collectRenderableBlocks(node.childNodes, blocks);
    }
  }
  return blocks;
}

function nodeHasFragment(node: HtmlNode, fragment: string) {
  if (!isHtmlElement(node)) {
    return false;
  }
  const id = getAttribute(node, 'id');
  const name = getAttribute(node, 'name');
  return [id, name].some((value) => {
    if (!value) return false;
    const normalized = normalizeFragment(value);
    return normalized === fragment || normalized.toLowerCase() === fragment.toLowerCase();
  });
}

export function normalizeFragment(fragment: string) {
  try {
    return decodeURIComponent(fragment).trim();
  } catch {
    return fragment.trim();
  }
}

export function blockContainsFragment(node: HtmlNode, fragment: string): boolean {
  if (nodeHasFragment(node, fragment)) {
    return true;
  }
  if (!('childNodes' in node)) {
    return false;
  }
  return node.childNodes.some((child) => blockContainsFragment(child, fragment));
}

export function countFragmentMatches(nodes: HtmlNode[], fragment: string) {
  let count = 0;
  const visit = (node: HtmlNode) => {
    if (nodeHasFragment(node, fragment)) {
      count += 1;
    }
    if ('childNodes' in node) {
      node.childNodes.forEach(visit);
    }
  };
  nodes.forEach(visit);
  return count;
}

export function serializeBlocks(blocks: HtmlNode[]) {
  return blocks.map((block) => serializeOuter(block)).join('\n');
}
