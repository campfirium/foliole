import { normalizeFullTextWithMap } from './contextExcerptFullTextNormalize.js';
import { findFullTextLocatorMatch } from './contextExcerptFullTextSearch.js';
import { toLocatedMatch, toTrimmedMatch } from './contextExcerptMatchSupport.js';
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
  const paragraphMatch = findParagraphContextExcerptMatch(locator, quote, quoteLocator, toLocatedMatch);
  if (paragraphMatch && isUsableLocatorTextMatch(paragraphMatch, quote)) {
    return paragraphMatch;
  }
  return findFullTextLocatorMatch(locator, quote, quoteLocator);
}

function isUsableLocatorTextMatch(match: string, quote: string) {
  const quoteLineCount = normalizeLineEndings(quote)
    .split('\n')
    .map((line) => normalizeQuoteText(line))
    .filter(Boolean).length;
  if (quoteLineCount <= 1) {
    return true;
  }
  const matchLength = normalizeQuoteText(match).length;
  const quoteLength = normalizeQuoteText(quote).length;
  if (matchLength === 0 || quoteLength === 0) {
    return false;
  }
  const ratio = matchLength / quoteLength;
  return ratio >= 0.7 && ratio <= 1.6;
}

export function findContextExcerptInLocator(locator: ContextExcerptLocator, quote: string) {
  const quoteLocator = createContextExcerptQuoteLocator(quote);
  if (!quoteLocator) {
    return null;
  }
  return findContextExcerptInLocatorByQuoteLocator(locator, quote, quoteLocator);
}
