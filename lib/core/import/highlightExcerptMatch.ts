import { findContextExcerptLocatorTextInLocatorByQuoteLocator, type ContextExcerptLocator } from './contextExcerptLocator.js';
import {
  createContextExcerptQuoteLocator,
  normalizeQuoteText,
  type ContextExcerptQuoteLocator
} from './contextExcerptQuoteLocator.js';

export interface HighlightExcerptCandidate {
  label?: string | null;
  text: string;
}

export interface PreparedHighlightExcerptCandidate {
  label: string | null;
  quote: string;
  quoteLocator: ContextExcerptQuoteLocator | null;
  quoteWithoutTitleLocator: ContextExcerptQuoteLocator | null;
  quoteWithoutTitle: string | null;
}

function createQuoteWithoutTitle(quote: string) {
  const lines = quote.replace(/\r\n?/g, '\n').split('\n');
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentLine < 0) {
    return null;
  }
  const rest = lines.slice(firstContentLine + 1).join('\n').trim();
  return rest.length > 0 ? rest : null;
}

export function prepareHighlightExcerptCandidate(candidate: HighlightExcerptCandidate): PreparedHighlightExcerptCandidate {
  const quote = candidate.text;
  const quoteWithoutTitle = createQuoteWithoutTitle(quote);
  return {
    label: candidate.label?.trim() || null,
    quote,
    quoteLocator: createContextExcerptQuoteLocator(quote),
    quoteWithoutTitle,
    quoteWithoutTitleLocator: quoteWithoutTitle ? createContextExcerptQuoteLocator(quoteWithoutTitle) : null
  };
}

export function findPreparedHighlightExcerptInLocator(
  locator: ContextExcerptLocator,
  prepared: PreparedHighlightExcerptCandidate
) {
  if (!prepared.quoteLocator) {
    return null;
  }
  const fullMatch = findContextExcerptLocatorTextInLocatorByQuoteLocator(locator, prepared.quote, prepared.quoteLocator);
  if (
    fullMatch ||
    !prepared.quoteWithoutTitle ||
    !prepared.quoteWithoutTitleLocator
  ) {
    return fullMatch;
  }
  const titlelessMatch = findContextExcerptLocatorTextInLocatorByQuoteLocator(
    locator,
    prepared.quoteWithoutTitle,
    prepared.quoteWithoutTitleLocator
  );
  return titlelessMatch && normalizeQuoteText(titlelessMatch) === normalizeQuoteText(prepared.quoteWithoutTitle)
    ? titlelessMatch
    : null;
}
