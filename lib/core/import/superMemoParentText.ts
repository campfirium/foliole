import type { DefaultTreeAdapterTypes } from 'parse5';

import type { TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';

export function isSuperMemoReference(node: DefaultTreeAdapterTypes.Element) {
  return node.tagName === 'supermemoreference' ||
    (node.tagName === 'hr' && node.attrs.some(attribute => attribute.name === 'supermemo'));
}

export function prepareSuperMemoParentText(body: string) {
  const frontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/u.exec(body);
  const offset = frontmatter?.[0].length ?? 0;
  return { ...normalizeFullTextWithMap(body.slice(offset)), offset };
}

export type SuperMemoParentText = ReturnType<typeof prepareSuperMemoParentText>;

export function superMemoParentTextRange(parent: SuperMemoParentText, from: number, to: number): TextAnchorLocator | null {
  const start = parent.rawIndexes[from];
  const end = parent.rawIndexes[to - 1];
  if (start === undefined || end === undefined || end < start) return null;
  return { from: parent.offset + start, to: parent.offset + end + 1, originalText: parent.raw.slice(start, end + 1) };
}
