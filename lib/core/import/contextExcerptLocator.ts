import {
  collectOrderedBoundaryFragments,
  collectOrderedMatchCandidates,
  findNearestParagraphIndex,
  resolveBestNearbyRange,
  type AnchoredFragmentCandidate,
  type RepeatedFragmentCandidate
} from './contextExcerptFragmentSearch.js';
import {
  createContextExcerptQuoteLocator,
  normalizeLineEndings,
  normalizeQuoteText,
  type ContextExcerptQuoteLocator
} from './contextExcerptQuoteLocator.js';
import { trimMatchedExcerpt } from './controlledContextTrim.js';

const MAX_FRAGMENT_ATTEMPTS_PER_HIGHLIGHT = 220;
const MAX_FRAGMENT_MATCH_TIME_MS = 40;

interface MatchBudget {
  attempts: number;
  startedAtMs: number;
  stopped: boolean;
}

function createMatchBudget(): MatchBudget {
  return { attempts: 0, startedAtMs: Date.now(), stopped: false };
}

function consumeAttempt(budget: MatchBudget) {
  if (budget.stopped) {
    return false;
  }
  const timedOut = Date.now() - budget.startedAtMs >= MAX_FRAGMENT_MATCH_TIME_MS;
  if (timedOut || budget.attempts >= MAX_FRAGMENT_ATTEMPTS_PER_HIGHLIGHT) {
    budget.stopped = true;
    return false;
  }
  budget.attempts += 1;
  return true;
}

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

function shrinkRangeToMinimumMatch(paragraphs: string[], range: { start: number; end: number }, exactMatcher: RegExp | null) {
  if (!exactMatcher) {
    return range;
  }
  let start = range.start;
  let end = range.end;
  while (start < end && exactMatcher.test(joinParagraphRange(paragraphs, start, end - 1))) {
    end -= 1;
  }
  while (start < end && exactMatcher.test(joinParagraphRange(paragraphs, start + 1, end))) {
    start += 1;
  }
  return { start, end };
}

function shrinkMatchedLines(raw: string, exactMatcher: RegExp | null) {
  if (!exactMatcher) {
    return raw.trim();
  }
  const lines = normalizeLineEndings(raw).split('\n');
  if (lines.length <= 1) {
    return raw.trim();
  }
  let start = 0;
  let end = lines.length - 1;
  while (start < end && exactMatcher.test(lines.slice(start, end).join('\n').trim())) {
    end -= 1;
  }
  while (start < end && exactMatcher.test(lines.slice(start + 1, end + 1).join('\n').trim())) {
    start += 1;
  }
  return lines.slice(start, end + 1).join('\n').trim();
}

function toTrimmedMatch(raw: string, quote: string, anchorFragment: string, exactMatcher: RegExp | null) {
  return shrinkMatchedLines(trimMatchedExcerpt(raw, quote, anchorFragment), exactMatcher);
}

function tryExactMatch(locator: ContextExcerptLocator, quote: string, quoteLocator: ContextExcerptQuoteLocator) {
  const strictIndexes = findParagraphIndexesContainingFragment(locator.normalizedParagraphs, quoteLocator.normalizedQuote);
  if (strictIndexes.length === 1) {
    return toTrimmedMatch(
      locator.paragraphs[strictIndexes[0]],
      quote,
      quoteLocator.normalizedQuote,
      quoteLocator.exactMatcher
    );
  }

  if (!quoteLocator.exactMatcher) {
    return null;
  }
  const looseIndexes = findParagraphIndexesContainingRegex(locator.paragraphs, quoteLocator.exactMatcher);
  if (looseIndexes.length !== 1) {
    return null;
  }
  return toTrimmedMatch(locator.paragraphs[looseIndexes[0]], quote, quoteLocator.normalizedQuote, quoteLocator.exactMatcher);
}

function tryOrderedFragmentMatch(
  locator: ContextExcerptLocator,
  quoteLocator: ContextExcerptQuoteLocator,
  budget: MatchBudget
) {
  return collectOrderedMatchCandidates({
    budget,
    consumeAttempt,
    findParagraphIndexesContainingFragment: (fragment) => findParagraphIndexesContainingFragment(locator.normalizedParagraphs, fragment),
    orderedFragments: quoteLocator.orderedFragments
  });
}

function tryAnchoredRangeMatch(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  anchoredCandidate: AnchoredFragmentCandidate | null
) {
  if (!anchoredCandidate) {
    return null;
  }

  const boundaryFragments = collectOrderedBoundaryFragments(normalizeLineEndings(quote));
  const firstBoundary = boundaryFragments[0] ?? anchoredCandidate.fragment;
  const lastBoundary = boundaryFragments.at(-1) ?? anchoredCandidate.fragment;
  if (!firstBoundary || !lastBoundary) {
    return toTrimmedMatch(
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
    return toTrimmedMatch(
      locator.paragraphs[anchoredCandidate.index],
      quote,
      anchoredCandidate.fragment,
      quoteLocator.exactMatcher
    );
  }

  const start = Math.min(startIndex, anchoredCandidate.index);
  const end = Math.max(endIndex, anchoredCandidate.index);
  const narrowed = shrinkRangeToMinimumMatch(locator.paragraphs, { start, end }, quoteLocator.exactMatcher);

  return toTrimmedMatch(
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
  budget: MatchBudget
) {
  if (repeatedCandidates.length < 2 || budget.stopped) {
    return null;
  }
  const bestRange = resolveBestNearbyRange(repeatedCandidates, budget, consumeAttempt);
  if (!bestRange) {
    return null;
  }
  const narrowed = shrinkRangeToMinimumMatch(locator.paragraphs, bestRange, quoteLocator.exactMatcher);
  const raw = joinParagraphRange(locator.paragraphs, narrowed.start, narrowed.end);
  return toTrimmedMatch(raw, quote, bestRange.anchorFragment, quoteLocator.exactMatcher);
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

export function findContextExcerptInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  const exactMatch = tryExactMatch(locator, quote, quoteLocator);
  if (exactMatch) {
    return exactMatch;
  }
  const budget = createMatchBudget();
  const orderedMatch = tryOrderedFragmentMatch(locator, quoteLocator, budget);
  const anchoredMatch = tryAnchoredRangeMatch(locator, quote, quoteLocator, orderedMatch.anchoredCandidate);
  if (anchoredMatch) {
    return anchoredMatch;
  }
  return tryNearbyRangeMatch(locator, quote, quoteLocator, orderedMatch.repeatedCandidates, budget);
}

export function findContextExcerptInLocator(locator: ContextExcerptLocator, quote: string) {
  const quoteLocator = createContextExcerptQuoteLocator(quote);
  if (!quoteLocator) {
    return null;
  }
  return findContextExcerptInLocatorByQuoteLocator(locator, quote, quoteLocator);
}
