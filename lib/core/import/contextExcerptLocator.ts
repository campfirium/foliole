import {
  collectOrderedBoundaryFragments,
  collectOrderedMatchCandidates,
  findNearestParagraphIndex,
  resolveBestNearbyRange,
  type AnchoredFragmentCandidate,
  type RepeatedFragmentCandidate
} from './contextExcerptFragmentSearch.js';
import { repairIncompleteOrderedQuoteMatch } from './contextExcerptMatchRepair.js';
import {
  consumeAttempt,
  createMatchBudget,
  isValidRangeMatch,
  shrinkRangeToMinimumMatch,
  toLocatedMatch,
  toTrimmedMatch,
  type MatchBudget,
  type MatchProjector
} from './contextExcerptMatchSupport.js';
import {
  createContextExcerptQuoteLocator,
  normalizeLineEndings,
  normalizeQuoteText,
  type ContextExcerptQuoteLocator
} from './contextExcerptQuoteLocator.js';

const MAX_FRAGMENT_ATTEMPTS_PER_HIGHLIGHT = 220;
const MAX_FRAGMENT_MATCH_TIME_MS = 40;

function splitParagraphs(content: string) {
  return normalizeLineEndings(content)
    .split(/\n{2,}/)
    .filter((raw) => raw.trim().length > 0);
}

function normalizeParagraphs(paragraphs: string[]) {
  return paragraphs.map((paragraph) => normalizeQuoteText(paragraph));
}

function findParagraphIndexesContainingRegex(paragraphs: string[], matcher: RegExp) {
  const indexes: number[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (matcher.test(paragraph)) {
      indexes.push(index);
    }
  });
  return indexes;
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

function tryExactMatch(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  projectMatch: MatchProjector
) {
  const strictIndexes = findParagraphIndexesContainingFragment(locator.normalizedParagraphs, quoteLocator.normalizedQuote);
  if (strictIndexes.length === 1) {
    const paragraph = locator.paragraphs[strictIndexes[0]];
    if (isValidRangeMatch(paragraph, quote, quoteLocator.exactMatcher)) {
      return projectMatch(paragraph, quote, quoteLocator.normalizedQuote, quoteLocator.exactMatcher);
    }
  }

  if (!quoteLocator.exactMatcher) {
    return null;
  }
  const looseIndexes = findParagraphIndexesContainingRegex(locator.paragraphs, quoteLocator.exactMatcher);
  if (looseIndexes.length !== 1) {
    return null;
  }
  const paragraph = locator.paragraphs[looseIndexes[0]];
  if (!isValidRangeMatch(paragraph, quote, quoteLocator.exactMatcher)) {
    return null;
  }
  return projectMatch(paragraph, quote, quoteLocator.normalizedQuote, quoteLocator.exactMatcher);
}

function tryOrderedFragmentMatch(
  locator: ContextExcerptLocator,
  quoteLocator: ContextExcerptQuoteLocator,
  budget: MatchBudget
) {
  return collectOrderedMatchCandidates({
    budget,
    consumeAttempt: (nextBudget) => consumeAttempt(nextBudget, MAX_FRAGMENT_ATTEMPTS_PER_HIGHLIGHT, MAX_FRAGMENT_MATCH_TIME_MS),
    findParagraphIndexesContainingFragment: (fragment) => findParagraphIndexesContainingFragment(locator.normalizedParagraphs, fragment),
    orderedFragments: quoteLocator.orderedFragments
  });
}

function tryAnchoredRangeMatch(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  anchoredCandidate: AnchoredFragmentCandidate | null,
  projectMatch: MatchProjector
) {
  if (!anchoredCandidate) {
    return null;
  }

  const boundaryFragments = collectOrderedBoundaryFragments(normalizeLineEndings(quote));
  const firstBoundary = boundaryFragments[0] ?? anchoredCandidate.fragment;
  const lastBoundary = boundaryFragments.at(-1) ?? anchoredCandidate.fragment;
  if (!firstBoundary || !lastBoundary) {
    return projectMatch(
      locator.paragraphs[anchoredCandidate.index],
      quote,
      anchoredCandidate.fragment,
      quoteLocator.exactMatcher
    );
  }

  const startIndex = findNearestParagraphIndex(
    findParagraphIndexesContainingFragment(locator.normalizedParagraphs, firstBoundary),
    anchoredCandidate.index,
    'backward'
  );
  const endIndex = findNearestParagraphIndex(
    findParagraphIndexesContainingFragment(locator.normalizedParagraphs, lastBoundary),
    anchoredCandidate.index,
    'forward'
  );
  if (startIndex === null || endIndex === null) {
    return projectMatch(
      locator.paragraphs[anchoredCandidate.index],
      quote,
      anchoredCandidate.fragment,
      quoteLocator.exactMatcher
    );
  }

  const start = Math.min(startIndex, anchoredCandidate.index);
  const end = Math.max(endIndex, anchoredCandidate.index);
  const narrowed = shrinkRangeToMinimumMatch(locator.paragraphs, { start, end }, quote, quoteLocator.exactMatcher);

  return projectMatch(
    joinParagraphRange(locator.paragraphs, narrowed.start, narrowed.end),
    quote,
    anchoredCandidate.fragment,
    quoteLocator.exactMatcher
  );
}

function tryNearbyRangeMatch(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  repeatedCandidates: RepeatedFragmentCandidate[],
  budget: MatchBudget,
  projectMatch: MatchProjector
) {
  if (repeatedCandidates.length < 2 || budget.stopped) {
    return null;
  }
  const bestRange = resolveBestNearbyRange(
    repeatedCandidates,
    budget,
    (nextBudget) => consumeAttempt(nextBudget, MAX_FRAGMENT_ATTEMPTS_PER_HIGHLIGHT, MAX_FRAGMENT_MATCH_TIME_MS)
  );
  if (!bestRange) {
    return null;
  }
  const narrowed = shrinkRangeToMinimumMatch(locator.paragraphs, bestRange, quote, quoteLocator.exactMatcher);
  const raw = joinParagraphRange(locator.paragraphs, narrowed.start, narrowed.end);
  return projectMatch(raw, quote, bestRange.anchorFragment, quoteLocator.exactMatcher);
}

export interface ContextExcerptLocator {
  paragraphs: string[];
  normalizedParagraphs: string[];
}

export function createContextExcerptLocator(content: string): ContextExcerptLocator {
  const paragraphs = splitParagraphs(content);
  return { normalizedParagraphs: normalizeParagraphs(paragraphs), paragraphs };
}

export { createContextExcerptQuoteLocator, type ContextExcerptQuoteLocator };

function resolveContextExcerptMatchByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  projectMatch: MatchProjector
) {
  const exactMatch = repairIncompleteOrderedQuoteMatch(
    locator,
    quote,
    quoteLocator,
    tryExactMatch(locator, quote, quoteLocator, projectMatch),
    projectMatch
  );
  if (exactMatch) {
    return exactMatch;
  }
  const budget = createMatchBudget();
  const orderedMatch = tryOrderedFragmentMatch(locator, quoteLocator, budget);
  const anchoredMatch = repairIncompleteOrderedQuoteMatch(
    locator,
    quote,
    quoteLocator,
    tryAnchoredRangeMatch(locator, quote, quoteLocator, orderedMatch.anchoredCandidate, projectMatch),
    projectMatch
  );
  if (anchoredMatch) {
    return anchoredMatch;
  }
  return repairIncompleteOrderedQuoteMatch(
    locator,
    quote,
    quoteLocator,
    tryNearbyRangeMatch(locator, quote, quoteLocator, orderedMatch.repeatedCandidates, budget, projectMatch),
    projectMatch
  );
}

export function findContextExcerptInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  return resolveContextExcerptMatchByQuoteLocator(locator, quote, quoteLocator, toTrimmedMatch);
}

export function findContextExcerptLocatorTextInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  return resolveContextExcerptMatchByQuoteLocator(locator, quote, quoteLocator, toLocatedMatch);
}

export function findContextExcerptInLocator(locator: ContextExcerptLocator, quote: string) {
  const quoteLocator = createContextExcerptQuoteLocator(quote);
  if (!quoteLocator) {
    return null;
  }
  return findContextExcerptInLocatorByQuoteLocator(locator, quote, quoteLocator);
}
