import type { ContextExcerptQuoteLocator } from './contextExcerptQuoteLocator.js';

const MAX_PRESENCE_CHECK_FRAGMENTS = 12;

interface FullTextLocatorPresence {
  normalizedFullText: string;
  normalizedFullTextLower?: string;
}

export function canSkipFullTextLocatorSearch(
  locator: FullTextLocatorPresence,
  quoteLocator: ContextExcerptQuoteLocator
) {
  const fragments = quoteLocator.orderedFragments.slice(0, MAX_PRESENCE_CHECK_FRAGMENTS);
  if (fragments.length === 0) {
    return false;
  }
  const haystack = locator.normalizedFullTextLower ?? locator.normalizedFullText.toLocaleLowerCase();
  return !fragments.some((fragment) => haystack.includes(fragment.toLocaleLowerCase()));
}
