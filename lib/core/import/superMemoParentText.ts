import type { DefaultTreeAdapterTypes } from 'parse5';

import type { TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import type { SuperMemoMarkKind, SuperMemoNativeMarks } from './superMemoNativeMarks.js';

export function isSuperMemoReference(node: DefaultTreeAdapterTypes.Element) {
  return node.tagName === 'supermemoreference' ||
    (node.tagName === 'hr' && node.attrs.some(attribute => attribute.name === 'supermemo'));
}

export function prepareSuperMemoParentText(body: string, nativeMarks?: SuperMemoNativeMarks) {
  const frontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/u.exec(body);
  const offset = frontmatter?.[0].length ?? 0;
  return { ...normalizeFullTextWithMap(body.slice(offset)), offset, nativeMarks };
}

export type SuperMemoParentText = ReturnType<typeof prepareSuperMemoParentText>;

export function superMemoParentTextRange(parent: SuperMemoParentText, from: number, to: number): TextAnchorLocator | null {
  const start = parent.rawIndexes[from];
  const end = parent.rawIndexes[to - 1];
  if (start === undefined || end === undefined || end < start) return null;
  return { from: parent.offset + start, to: parent.offset + end + 1, originalText: parent.raw.slice(start, end + 1) };
}

export function isSuperMemoNativeMarked(parent: SuperMemoParentText, kind: SuperMemoMarkKind, from: number, to: number) {
  const marks = parent.nativeMarks?.[kind];
  if (!marks?.length) return false;
  let markIndex = 0;
  for (let index = from; index < to; index++) {
    if (/\s/u.test(parent.normalized[index] ?? '')) continue;
    const offset = parent.rawIndexes[index];
    if (offset === undefined) return false;
    const raw = offset + parent.offset;
    while (marks[markIndex] && marks[markIndex]!.to <= raw) markIndex++;
    if (!marks[markIndex] || marks[markIndex]!.from > raw) return false;
  }
  return true;
}
