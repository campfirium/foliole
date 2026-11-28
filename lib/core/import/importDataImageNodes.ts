import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

import { isDataUrlDestination, normalizeSafeMarkdownDataImageUrl } from '../../platform/markdownImageDataUrl.js';
import { folioleMarkdownParser } from '../markdown/folioleMarkdownParser.js';
import {
  collectMarkdownReferenceDefinitions, resolveMarkdownReference, type MarkdownReferenceDefinition
} from '../markdown/markdownReferences.js';
import { utf8ByteLength } from '../nodes/textBodyBudget.js';

export interface ImportDataImageNode {
  byteLength: number;
  destination: string;
  from: number;
  referenceLabel?: string;
  /** The node rewritten to point at `target`. */
  render: (target: string) => string;
  to: number;
}

type Tree = ReturnType<typeof folioleMarkdownParser.parse>;
type SyntaxNode = Tree['topNode'];
type Definitions = ReturnType<typeof collectMarkdownReferenceDefinitions>;

// Comments and raw-text elements are skipped whole, so sample markup inside them is never read as an image.
const HTML_TOKEN = /<!--[\s\S]*?(?:-->|$)|<(pre|script|style|textarea)\b[\s\S]*?(?:<\/\1\s*>|$)|<\/?[a-z](?:"[^"]*"|'[^']*'|[^>"'])*>/gi;

function unwrapDestination(raw: string) {
  return raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
}

function isDataDestination(destination: string) {
  return isDataUrlDestination(destination) || Boolean(normalizeSafeMarkdownDataImageUrl(destination));
}

function markdownImage(node: SyntaxNode, content: string, definitions: Definitions): ImportDataImageNode | null {
  const { from, to } = node;
  const url = node.getChild('URL');
  const reference = url ? null : resolveMarkdownReference(node, content, definitions);
  const raw = url ? content.slice(url.from, url.to) : reference?.raw;
  if (!raw) return null;
  const destination = unwrapDestination(raw);
  if (!isDataDestination(destination)) return null;
  const ownBytes = utf8ByteLength(content.slice(from, to));
  if (url) {
    return {
      byteLength: ownBytes, destination, from, to,
      render: target => content.slice(from, url.from) + target + content.slice(url.to, to)
    };
  }
  const { key, text, title } = reference!;
  return {
    byteLength: ownBytes + utf8ByteLength(raw), destination, from, to, referenceLabel: key,
    render: target => `![${text}](${target}${title ? ` ${title}` : ''})`
  };
}

function readImageAttributes(tag: string) {
  const [element] = parseFragment(tag).childNodes as DefaultTreeAdapterTypes.Element[];
  return new Map(element?.attrs?.map(attribute => [attribute.name, attribute.value]) ?? []);
}

function htmlImage(tag: string, from: number): ImportDataImageNode | null {
  const attributes = readImageAttributes(tag);
  const destination = (attributes.get('src') ?? '').replace(/\s+/g, '');
  if (!isDataDestination(destination)) return null;
  const alt = (attributes.get('alt') ?? '').replace(/\s+/g, ' ').trim().replace(/[\\[\]]/g, '\\$&');
  const width = /^\s*([1-9]\d*)(?:px)?\s*$/i.exec(attributes.get('width') ?? '')?.[1];
  const title = (attributes.get('title') ?? '').replace(/\s+/g, ' ').trim().replace(/[\\"]/g, '\\$&');
  return {
    byteLength: utf8ByteLength(tag), destination, from, to: from + tag.length,
    render: target => `![${width ? `${alt}|${width}` : alt}](${target}${title ? ` "${title}"` : ''})`
  };
}

function htmlImages(node: SyntaxNode, content: string) {
  const source = content.slice(node.from, node.to);
  const images: ImportDataImageNode[] = [];
  const isTopLevelBlock = node.name === 'HTMLBlock' && node.parent?.name === 'Document';
  let wrapped = false;
  let cursor = 0;
  for (const match of source.matchAll(HTML_TOKEN)) {
    const token = match[0];
    const isImage = /^<img\b/i.test(token);
    wrapped ||= Boolean(source.slice(cursor, match.index).trim()) || !isImage;
    cursor = match.index + token.length;
    const image = isImage ? htmlImage(token, node.from + match.index) : null;
    if (!image) continue;
    // Markdown is not read inside an HTML block, so a wrapped image has to start a paragraph of its own.
    const gap = source[match.index - 1] === '\n' ? '\n' : '\n\n';
    images.push(isTopLevelBlock && wrapped ? { ...image, render: target => gap + image.render(target) } : image);
  }
  return images;
}

/** Data images written as `![](…)`, as a reference, or as a bare `<img>`; code is never read. */
export function collectImportDataImageNodes(content: string) {
  const tree = folioleMarkdownParser.parse(content);
  const definitions = collectMarkdownReferenceDefinitions(tree, content);
  const nodes: ImportDataImageNode[] = [];
  const linkedLabels = new Set<string>();
  tree.iterate({
    enter(node) {
      if (node.name === 'Image') {
        const image = markdownImage(node.node, content, definitions);
        if (image) nodes.push(image);
      } else if (node.name === 'HTMLTag' || node.name === 'HTMLBlock') {
        nodes.push(...htmlImages(node.node, content));
      } else if (node.name === 'Link' && !node.node.getChild('URL')) {
        const reference = resolveMarkdownReference(node.node, content, definitions);
        if (reference) linkedLabels.add(reference.key);
      }
    }
  });
  return { nodes, definitions, linkedLabels };
}

function definitionRemoval(content: string, definition: MarkdownReferenceDefinition) {
  let { from, to } = definition;
  const lineStart = content.lastIndexOf('\n', from - 1) + 1;
  if (/^[ \t>]*$/.test(content.slice(lineStart, from))) {
    from = lineStart;
    const lineEnd = content.indexOf('\n', to);
    to = lineEnd < 0 ? content.length : lineEnd + 1;
    // Avoid leaving two blank lines where the definition stood.
    if (content[to] === '\n' && (from === 0 || content.slice(0, from).endsWith('\n\n'))) to += 1;
  }
  return { from, to, text: '' };
}

export function collectUnusedDefinitionRemovals(content: string, definitions: Definitions, labels: string[]) {
  return labels.map(label => definitionRemoval(content, definitions.get(label)!));
}

/** Ranges that body splitting must not cut, for the two syntaxes it cannot find by its image scan. */
export function collectDataImageSourceSpans(content: string) {
  if (!content.includes('data:')) return [];
  const { nodes, definitions } = collectImportDataImageNodes(content);
  return [
    ...nodes.map(({ from, to }) => ({ from, to })),
    ...[...definitions.values()].filter(definition => isDataDestination(unwrapDestination(definition.raw)))
      .map(({ from, to }) => ({ from, to }))
  ];
}
