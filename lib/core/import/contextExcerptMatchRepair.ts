import { normalizeQuoteText, type ContextExcerptQuoteLocator } from './contextExcerptQuoteLocator.js';
import { containsOrderedQuoteLines } from './controlledContextTrim.js';

interface RepairContextExcerptLocator {
  normalizedParagraphs: string[];
  paragraphs: string[];
}

function findParagraphIndexesContainingFragment(paragraphs: string[], fragment: string) {
  const indexes: number[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.includes(fragment)) {
      indexes.push(index);
    }
  });
  return indexes;
}

function joinParagraphRange(paragraphs: string[], startIndex: number, endIndex: number) {
  return paragraphs.slice(startIndex, endIndex + 1).join('\n\n').trim();
}

export function repairIncompleteOrderedQuoteMatch(
  locator: RepairContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  match: string | null,
  toTrimmedMatch: (raw: string, quote: string, anchorFragment: string, exactMatcher: RegExp | null) => string
) {
  if (!match || containsOrderedQuoteLines(match, quote)) {
    return match;
  }
  const normalizedMatch = normalizeQuoteText(match);
  if (!normalizedMatch) {
    return match;
  }
  const candidateIndexes = findParagraphIndexesContainingFragment(locator.normalizedParagraphs, normalizedMatch);
  const anchorFragment = quoteLocator.orderedFragments[0] ?? quoteLocator.normalizedQuote;

  for (const index of candidateIndexes) {
    for (let start = Math.max(0, index - 1); start <= index; start += 1) {
      for (let end = index; end <= Math.min(locator.paragraphs.length - 1, index + 1); end += 1) {
        const raw = joinParagraphRange(locator.paragraphs, start, end);
        if (containsOrderedQuoteLines(raw, quote)) {
          return toTrimmedMatch(raw, quote, anchorFragment, quoteLocator.exactMatcher);
        }
      }
    }
  }

  return match;
}
