import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import { findFullTextLocatorMatch } from './contextExcerptFullTextSearch.js';
import { toTrimmedMatch } from './contextExcerptMatchSupport.js';
import { findParagraphContextExcerptMatch } from './contextExcerptParagraphSearch.js';
import {
  createContextExcerptQuoteLocator,
  normalizeLineEndings,
  normalizeQuoteText,
  type ContextExcerptQuoteLocator
} from './contextExcerptQuoteLocator.js';

function splitParagraphs(content: string) {
  return normalizeLineEndings(content)
    .split(/\n{2,}/)
    .filter((raw) => raw.trim().length > 0);
}

function normalizeParagraphs(paragraphs: string[]) {
  return paragraphs.map((paragraph) => normalizeQuoteText(paragraph));
}

export interface ContextExcerptLocator {
  content: string;
  normalizedFullText: string;
  normalizedFullTextRawIndexes: number[];
  paragraphs: string[];
  normalizedParagraphs: string[];
}

export function createContextExcerptLocator(content: string): ContextExcerptLocator {
  const paragraphs = splitParagraphs(content);
  const fullText = normalizeFullTextWithMap(content);
  return {
    content: fullText.raw,
    normalizedFullText: fullText.normalized,
    normalizedFullTextRawIndexes: fullText.rawIndexes,
    normalizedParagraphs: normalizeParagraphs(paragraphs),
    paragraphs
  };
}

export { createContextExcerptQuoteLocator, type ContextExcerptQuoteLocator };

export function findContextExcerptInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  return findParagraphContextExcerptMatch(locator, quote, quoteLocator, toTrimmedMatch);
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
