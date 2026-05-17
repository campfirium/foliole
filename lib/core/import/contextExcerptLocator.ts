import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import { findFullTextLocatorMatch } from './contextExcerptFullTextSearch.js';
import {
  createContextExcerptQuoteLocator,
  type ContextExcerptQuoteLocator
} from './contextExcerptQuoteLocator.js';

export interface ContextExcerptLocator {
  content: string;
  normalizedFullText: string;
  normalizedFullTextLower: string;
  normalizedFullTextRawIndexes: number[];
}

export function createContextExcerptLocator(content: string): ContextExcerptLocator {
  const fullText = normalizeFullTextWithMap(content);
  return {
    content: fullText.raw,
    normalizedFullText: fullText.normalized,
    normalizedFullTextLower: fullText.normalized.toLocaleLowerCase(),
    normalizedFullTextRawIndexes: fullText.rawIndexes
  };
}

export { createContextExcerptQuoteLocator, type ContextExcerptQuoteLocator };

export function findContextExcerptInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  return findFullTextLocatorMatch(locator, quote, quoteLocator);
}

export function findContextExcerptLocatorTextInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  return findFullTextLocatorMatch(locator, quote, quoteLocator);
}

export function findContextExcerptInLocator(locator: ContextExcerptLocator, quote: string) {
  const quoteLocator = createContextExcerptQuoteLocator(quote);
  if (!quoteLocator) {
    return null;
  }
  return findContextExcerptInLocatorByQuoteLocator(locator, quote, quoteLocator);
}
