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

const MARKDOWN_IMAGE_ONLY_PATTERN = /^\s*!\[([^\]]*)\][(]([^)\n]+)[)]\s*$/u;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\][(][^)\n]+[)]/g;

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

function parseMarkdownImageOnly(value: string) {
  const match = MARKDOWN_IMAGE_ONLY_PATTERN.exec(value);
  return match ? { altText: (match[1] ?? '').trim(), markdown: match[0].trim() } : null;
}

function markdownImageAltText(value: string) {
  return MARKDOWN_IMAGE_ONLY_PATTERN.exec(value)?.[1]?.trim() ?? null;
}

function findMarkdownImageExcerptInLocator(locator: ContextExcerptLocator, quote: string) {
  const quoteImage = parseMarkdownImageOnly(quote);
  if (!quoteImage) {
    return null;
  }
  const images = Array.from(locator.content.matchAll(MARKDOWN_IMAGE_PATTERN), (match) => match[0]);
  const exactMatches = images.filter((image) => image === quoteImage.markdown);
  if (exactMatches.length === 1) {
    return exactMatches[0] ?? null;
  }
  if (!quoteImage.altText) {
    return null;
  }
  const altMatches = images.filter((image) => markdownImageAltText(image) === quoteImage.altText);
  return altMatches.length === 1 ? altMatches[0] ?? null : null;
}

export function findPreparedHighlightExcerptInLocator(
  locator: ContextExcerptLocator,
  prepared: PreparedHighlightExcerptCandidate
) {
  if (!prepared.quoteLocator) {
    return findMarkdownImageExcerptInLocator(locator, prepared.quote);
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
