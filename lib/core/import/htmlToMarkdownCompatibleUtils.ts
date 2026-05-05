import type { DefaultTreeAdapterTypes } from 'parse5';

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;

export const BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul'
]);
export const CONTENT_STRIP_TAGS = new Set(['script', 'style']);
export const EMBEDDED_TAGS = new Set(['audio', 'embed', 'iframe', 'object', 'video']);

export function buildImageMarkdown(node: HtmlElement) {
  const src = getAttribute(node, 'src');
  const alt = normalizeInline(getAttribute(node, 'alt') ?? '');
  if (!src) return alt;
  return `![${alt}](${src})`;
}

export function buildEmbedPlaceholder(node: HtmlElement) {
  const source = getAttribute(node, 'src') ?? getAttribute(node, 'data') ?? getAttribute(node, 'href');
  return source ? `[Embedded ${node.tagName}: ${source}]` : `[Embedded ${node.tagName}]`;
}

export function wrapCode(content: string) {
  if (!content) return '';
  const marker = content.includes('`') ? '``' : '`';
  return `${marker}${content}${marker}`;
}

export function normalizeTextNode(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
}

export function normalizeInline(text: string) {
  return text.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function normalizeMarkdown(text: string) {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function indentLines(text: string, prefix: string) {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function prefixLines(text: string, prefix: string) {
  return text
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
    .join('\n');
}

export function getAttribute(node: HtmlElement, name: string) {
  return node.attrs.find((attribute) => attribute.name === name)?.value ?? null;
}

export function findElement(nodes: HtmlNode[], tagName: string) {
  return nodes.find((node): node is HtmlElement => 'tagName' in node && node.tagName === tagName) ?? null;
}

export function findElements(nodes: HtmlNode[], tagNames: string[]) {
  return nodes.filter((node): node is HtmlElement => 'tagName' in node && tagNames.includes(node.tagName));
}

export function isBlockNode(node: HtmlNode) {
  return 'tagName' in node && BLOCK_TAGS.has(node.tagName);
}
