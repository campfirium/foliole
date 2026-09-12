import type { ContextExcerptLocator } from './contextExcerptLocator.js';
import { normalizeQuoteText } from './contextExcerptQuoteLocator.js';

const GRAM_LENGTH = 4;
const MIN_QUOTE_LENGTH = 12;
const MIN_SCORE = 0.82;
const MIN_SCORE_MARGIN = 0.05;
const MAX_OCCURRENCES_PER_GRAM = 100;

interface CompactText {
  rawIndexes: number[];
  text: string;
}

function compactComparableText(value: string, rawIndexes?: number[]): CompactText {
  let text = '';
  const compactIndexes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value.slice(index, index + 4) === 'link') {
      index += 3;
      continue;
    }
    const character = value[index] ?? '';
    if (!/[\p{L}\p{N}]/u.test(character)) continue;
    text += character;
    compactIndexes.push(rawIndexes?.[index] ?? index);
  }
  return { rawIndexes: compactIndexes, text };
}

function collectCandidateStarts(body: string, quote: string) {
  const starts = new Set<number>();
  const step = Math.max(1, Math.floor((quote.length - GRAM_LENGTH) / 12));
  for (let offset = 0; offset <= quote.length - GRAM_LENGTH; offset += step) {
    const gram = quote.slice(offset, offset + GRAM_LENGTH);
    let occurrence = body.indexOf(gram);
    let count = 0;
    while (occurrence >= 0 && count < MAX_OCCURRENCES_PER_GRAM) {
      const start = occurrence - offset;
      if (start >= 0 && start + quote.length <= body.length) starts.add(start);
      occurrence = body.indexOf(gram, occurrence + 1);
      count += 1;
    }
  }
  return starts;
}

function similarityAt(body: string, quote: string, start: number) {
  let equal = 0;
  for (let index = 0; index < quote.length; index += 1) {
    if (body[start + index] === quote[index]) equal += 1;
  }
  return equal / quote.length;
}

export function findChineseVariantHighlightRange(
  locator: ContextExcerptLocator,
  quote: string,
  options: { afterRawIndex?: number } = {}
) {
  const normalizedQuote = compactComparableText(normalizeQuoteText(quote)).text;
  if (normalizedQuote.length < MIN_QUOTE_LENGTH || !/[\p{Script=Han}]/u.test(normalizedQuote)) return null;
  const body = compactComparableText(locator.normalizedFullText, locator.normalizedFullTextRawIndexes);
  const ranked = [...collectCandidateStarts(body.text, normalizedQuote)]
    .map((start) => ({ rawStart: body.rawIndexes[start], score: similarityAt(body.text, normalizedQuote, start), start }))
    .filter((item) => item.rawStart !== undefined && item.rawStart >= (options.afterRawIndex ?? 0))
    .sort((left, right) => right.score - left.score || left.start - right.start);
  const best = ranked[0];
  if (!best || best.score < MIN_SCORE) return null;
  const second = ranked[1];
  if (second && best.score - second.score < MIN_SCORE_MARGIN && options.afterRawIndex === undefined) return null;
  const rawStart = body.rawIndexes[best.start];
  const rawEnd = body.rawIndexes[best.start + normalizedQuote.length - 1];
  return rawStart === undefined || rawEnd === undefined
    ? null
    : { from: rawStart, to: rawEnd + 1 };
}
