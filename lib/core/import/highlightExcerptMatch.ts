import { findContextExcerptInLocatorByQuoteLocator, type ContextExcerptLocator } from './contextExcerptLocator.js';
import {
  createContextExcerptQuoteLocator,
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
}

export function prepareHighlightExcerptCandidate(candidate: HighlightExcerptCandidate): PreparedHighlightExcerptCandidate {
  const quote = candidate.text;
  return {
    label: candidate.label?.trim() || null,
    quote,
    quoteLocator: createContextExcerptQuoteLocator(quote)
  };
}

export function findPreparedHighlightExcerptInLocator(
  locator: ContextExcerptLocator,
  prepared: PreparedHighlightExcerptCandidate
) {
  if (!prepared.quoteLocator) {
    return null;
  }
  return findContextExcerptInLocatorByQuoteLocator(locator, prepared.quote, prepared.quoteLocator);
}
