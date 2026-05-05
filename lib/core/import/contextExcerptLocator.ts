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

interface RepeatedFragmentCandidate {
  fragment: string;
  indexes: number[];
}

interface AnchoredFragmentCandidate {
  fragment: string;
  index: number;
}

function collectOrderedBoundaryFragments(quote: string) {
  const unique = new Set<string>();
  const ordered: string[] = [];
  const splitter = /[\s。！？!?；;：:，,、•✔❌]+/u;
  for (const part of normalizeLineEndings(quote).split(splitter)) {
    const fragment = normalizeQuoteText(part);
    if (fragment.length < 4 || unique.has(fragment)) {
      continue;
    }
    unique.add(fragment);
    ordered.push(fragment);
  }
  return ordered;
}

function findNearestParagraphIndex(
  paragraphs: string[],
  fragment: string,
  anchorIndex: number,
  direction: 'backward' | 'forward'
) {
  const indexes = findParagraphIndexesContainingFragment(paragraphs, fragment);
  if (indexes.length === 0) {
    return null;
  }
  const eligible = indexes.filter((index) => (direction === 'backward' ? index <= anchorIndex : index >= anchorIndex));
  const pool = eligible.length > 0 ? eligible : indexes;
  return pool.reduce((best, current) => {
    if (best === null) {
      return current;
    }
    const bestDistance = Math.abs(best - anchorIndex);
    const currentDistance = Math.abs(current - anchorIndex);
    if (currentDistance !== bestDistance) {
      return currentDistance < bestDistance ? current : best;
    }
    if (direction === 'backward') {
      return current > best ? current : best;
    }
    return current < best ? current : best;
  }, null as number | null);
}

function tryOrderedFragmentMatch(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator,
  budget: MatchBudget
) {
  const repeatedCandidates: RepeatedFragmentCandidate[] = [];
  let anchoredCandidate: AnchoredFragmentCandidate | null = null;
  for (const fragment of quoteLocator.orderedFragments) {
    if (!consumeAttempt(budget)) {
      break;
    }
    const indexes = findParagraphIndexesContainingFragment(locator.normalizedParagraphs, fragment);
    if (indexes.length === 1) {
      anchoredCandidate = { fragment, index: indexes[0] };
      break;
    }
    if (indexes.length > 1 && indexes.length <= 12) {
      repeatedCandidates.push({ fragment, indexes });
    }
  }
  return { anchoredCandidate, repeatedCandidates };
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

  const boundaryFragments = collectOrderedBoundaryFragments(quote);
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

  const startIndex = findNearestParagraphIndex(locator.normalizedParagraphs, firstBoundary, anchoredCandidate.index, 'backward');
  const endIndex = findNearestParagraphIndex(locator.normalizedParagraphs, lastBoundary, anchoredCandidate.index, 'forward');
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

function resolveBestNearbyRange(candidates: RepeatedFragmentCandidate[], budget: MatchBudget) {
  let bestRange: { anchorFragment: string; end: number; start: number } | null = null;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      if (!consumeAttempt(budget)) {
        return bestRange;
      }
      const right = candidates[rightIndex];
      const matches: Array<{ start: number; end: number }> = [];
      for (const start of left.indexes) {
        for (const end of right.indexes) {
          if (Math.abs(end - start) > 1) {
            continue;
          }
          matches.push({ start: Math.min(start, end), end: Math.max(start, end) });
          if (matches.length > 1) {
            break;
          }
        }
        if (matches.length > 1) {
          break;
        }
      }
      if (matches.length !== 1) {
        continue;
      }
      const candidate = {
        anchorFragment: left.fragment,
        end: matches[0].end,
        start: matches[0].start
      };
      if (!bestRange) {
        bestRange = candidate;
        continue;
      }
      const bestSpan = bestRange.end - bestRange.start;
      const candidateSpan = candidate.end - candidate.start;
      if (candidateSpan < bestSpan || (candidateSpan === bestSpan && candidate.start < bestRange.start)) {
        bestRange = candidate;
      }
    }
  }
  return bestRange;
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
  const bestRange = resolveBestNearbyRange(repeatedCandidates, budget);
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
  const orderedMatch = tryOrderedFragmentMatch(locator, quote, quoteLocator, budget);
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
