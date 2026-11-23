import type { StoredAnchorLink } from '../database/anchorLinkCodec.js';

export interface AideContextNode {
  anchor: StoredAnchorLink | null;
  content: string;
  id: string;
  kind: string;
  reveal?: string | null;
  title: string;
}

export interface AideContextSourceChain {
  // Excerpt nodes strictly between the focus and the source, nearest first.
  anchoredAncestors: AideContextNode[];
  folderPath: string[];
  source: AideContextNode;
  // The anchored node whose anchor points into the source body.
  sourceAnchor: AideContextNode | null;
}

// Walks up the excerpt chain from the focus to the original text it came from.
export function resolveAideContextSource(
  focus: AideContextNode,
  ancestors: AideContextNode[]
): AideContextSourceChain | null {
  const nodes = [focus, ...ancestors];
  let index = 0;
  while (nodes[index]?.anchor && nodes[index + 1]) index += 1;
  const source = nodes[index];
  if (!source || source.kind === 'folder') return null;
  return {
    anchoredAncestors: nodes.slice(1, index),
    folderPath: nodes.slice(index + 1).reverse().map((node) => node.title.trim()).filter(Boolean),
    source,
    sourceAnchor: index > 0 ? nodes[index - 1] ?? null : null
  };
}

export function readAideAnchorOriginalText(anchor: StoredAnchorLink | null) {
  const locator = anchor?.locator as Record<string, unknown> | undefined;
  if (!locator) return '';
  if (typeof locator.originalText === 'string') return locator.originalText.trim();
  if (Array.isArray(locator.ranges)) {
    return locator.ranges
      .map((range) => (range && typeof range === 'object' ? (range as { originalText?: unknown }).originalText : ''))
      .filter((text): text is string => typeof text === 'string' && Boolean(text.trim()))
      .join(' … ')
      .trim();
  }
  return '';
}

export function readAideAnchorRange(anchor: StoredAnchorLink | null) {
  const locator = anchor?.locator as Record<string, unknown> | undefined;
  if (!locator) return null;
  const first = Array.isArray(locator.ranges) ? locator.ranges[0] as Record<string, unknown> | undefined : locator;
  return typeof first?.from === 'number' && typeof first.to === 'number' && first.to >= first.from
    ? { from: first.from, to: first.to }
    : null;
}

export function locateAideFocusRange(input: {
  chain: AideContextSourceChain;
  focus: AideContextNode;
  selectionText?: string | undefined;
}) {
  const body = input.chain.source.content;
  const anchor = input.chain.sourceAnchor?.anchor ?? null;
  if (anchor) {
    const original = readAideAnchorOriginalText(anchor);
    const range = readAideAnchorRange(anchor);
    if (range && (!original || body.slice(range.from, range.to).trim() === original)) return range;
    return findText(body, original);
  }
  return input.focus.id === input.chain.source.id ? findText(body, input.selectionText?.trim() ?? '') : null;
}

function findText(body: string, text: string) {
  if (!text) return null;
  const from = body.indexOf(text);
  return from >= 0 ? { from, to: from + text.length } : null;
}

export function readAideFrontmatterRange(content: string) {
  const match = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(content);
  return match ? { end: match[0].length, yaml: match[1] ?? '' } : { end: 0, yaml: '' };
}
