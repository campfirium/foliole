import { parseFragment, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

import type { TextAnchorLocator } from '../anchors/textAnchorLocator.js';

import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import { findContextExcerptInLocator } from './contextExcerptLocator.js';
import { createContextExcerptQuoteLocator } from './contextExcerptQuoteLocator.js';
import { convertSuperMemoContent } from './superMemoContent.js';
import { isSuperMemoReference, prepareSuperMemoParentText, superMemoParentTextRange, type SuperMemoParentText } from './superMemoParentText.js';

const MIN_SLICE_LENGTH = 8;
const MIN_SLICE_COVERAGE = 0.45;

function removeReferences(parent: DefaultTreeAdapterTypes.ParentNode) {
  parent.childNodes = parent.childNodes.filter(node => !('tagName' in node) || !isSuperMemoReference(node));
  for (const node of parent.childNodes) if ('childNodes' in node) removeReferences(node);
}

function uniquePosition(text: string, needle: string) {
  const from = text.indexOf(needle);
  return from >= 0 && text.indexOf(needle, from + 1) < 0 ? from : null;
}

function findWholeExcerpt(parent: SuperMemoParentText, quote: string) {
  const excerpt = findContextExcerptInLocator({
    content: parent.raw,
    normalizedFullText: parent.normalized,
    normalizedFullTextLower: parent.normalized.toLocaleLowerCase(),
    normalizedFullTextRawIndexes: parent.rawIndexes
  }, quote);
  if (!excerpt) return null;
  const from = uniquePosition(parent.raw, excerpt);
  return from === null ? null : { from: from + parent.offset, to: from + parent.offset + excerpt.length, originalText: excerpt };
}

function findSliceRange(parent: SuperMemoParentText, quote: string): TextAnchorLocator | null {
  const prepared = createContextExcerptQuoteLocator(quote);
  if (!prepared) return null;
  const text = prepared.normalizedQuote.replace(/[\p{P}\s]+$/u, '');
  const fragments = prepared.orderedFragments.map(fragment => fragment.replace(/[\p{P}\s]+$/u, ''))
    .filter(fragment => fragment.length >= MIN_SLICE_LENGTH);
  const first = fragments.find(fragment => text.startsWith(fragment) && text.indexOf(fragment, 1) < 0);
  const last = fragments.find(fragment => text.endsWith(fragment) && text.indexOf(fragment) === text.length - fragment.length);
  if (!first || !last || first === last || first.length + last.length > text.length) return null;
  const from = uniquePosition(parent.normalized, first);
  const end = uniquePosition(parent.normalized, last);
  if (from === null || end === null || end < from + first.length) return null;
  const tail = prepared.normalizedQuote.slice(text.length);
  const lastEnd = end + last.length;
  const to = parent.normalized.startsWith(tail, lastEnd) ? lastEnd + tail.length : lastEnd;
  if (to - from > text.length * 1.75 + 24) return null;
  const coverage = fragments.filter(fragment => fragment !== first && fragment !== last)
    .map(fragment => ({ fragment, quoteAt: text.indexOf(fragment) }))
    .sort((a, b) => a.quoteAt - b.quoteAt);
  let total = first.length + last.length;
  let parentCursor = from + first.length;
  let quoteCursor = first.length;
  for (const { fragment, quoteAt } of coverage) {
    if (quoteAt < quoteCursor || quoteAt + fragment.length > text.length - last.length) continue;
    const at = parent.normalized.indexOf(fragment, parentCursor);
    if (at < 0 || at + fragment.length > end) continue;
    total += fragment.length;
    parentCursor = at + fragment.length;
    quoteCursor = quoteAt + fragment.length;
  }
  return total >= text.length * MIN_SLICE_COVERAGE ? superMemoParentTextRange(parent, from, to) : null;
}

function withoutPunctuation(text: string) {
  return text.replace(/[\p{P}\s]/gu, '');
}

function findPunctuationAdjustedExcerpt(parent: SuperMemoParentText, quote: string) {
  const needle = withoutPunctuation(quote);
  if (needle.length < 12) return null;
  const positions: number[] = [];
  let offset = 0;
  for (const character of parent.normalized) {
    if (withoutPunctuation(character)) {
      for (let index = 0; index < character.length; index++) positions.push(offset + index);
    }
    offset += character.length;
  }
  const from = uniquePosition(withoutPunctuation(parent.normalized), needle);
  if (from === null) return null;
  const start = positions[from];
  const end = positions[from + needle.length - 1];
  if (start === undefined || end === undefined) return null;
  const trailing = /[\p{P}]+$/u.exec(quote)?.[0] ?? '';
  const to = parent.normalized.startsWith(trailing, end + 1) ? end + 1 + trailing.length : end + 1;
  return superMemoParentTextRange(parent, start, to);
}

export function findSuperMemoHighlightLocator(parent: SuperMemoParentText, excerptHtml: string[]): TextAnchorLocator | null {
  const markdown = convertSuperMemoContent(excerptHtml.map(part => {
    const fragment = parseFragment(part);
    removeReferences(fragment);
    return serialize(fragment);
  })).content;
  const quote = prepareSuperMemoParentText(markdown).raw.trim();
  const normalized = normalizeFullTextWithMap(quote).normalized.trim();
  if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) return null;
  const exact = parent.normalized.indexOf(normalized);
  if (exact >= 0) {
    if (parent.normalized.indexOf(normalized, exact + 1) >= 0) return null;
    return superMemoParentTextRange(parent, exact, exact + normalized.length);
  }
  return findWholeExcerpt(parent, quote) ?? findPunctuationAdjustedExcerpt(parent, normalized) ?? findSliceRange(parent, quote);
}
