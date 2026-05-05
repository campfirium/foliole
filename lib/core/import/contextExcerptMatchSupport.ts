import { containsOrderedQuoteLines, trimMatchedExcerpt } from './controlledContextTrim.js';

export interface MatchBudget {
  attempts: number;
  startedAtMs: number;
  stopped: boolean;
}

export type MatchProjector = (raw: string, quote: string, anchorFragment: string, exactMatcher: RegExp | null) => string;

export function createMatchBudget() {
  return { attempts: 0, startedAtMs: Date.now(), stopped: false } satisfies MatchBudget;
}

export function consumeAttempt(budget: MatchBudget, maxAttempts: number, maxTimeMs: number) {
  if (budget.stopped) {
    return false;
  }
  const timedOut = Date.now() - budget.startedAtMs >= maxTimeMs;
  if (timedOut || budget.attempts >= maxAttempts) {
    budget.stopped = true;
    return false;
  }
  budget.attempts += 1;
  return true;
}

export function isValidRangeMatch(raw: string, quote: string, exactMatcher: RegExp | null) {
  if (!containsOrderedQuoteLines(raw, quote)) {
    return false;
  }
  return exactMatcher ? exactMatcher.test(raw) : true;
}

export function shrinkRangeToMinimumMatch(
  paragraphs: string[],
  range: { start: number; end: number },
  quote: string,
  exactMatcher: RegExp | null
) {
  if (!exactMatcher) {
    return range;
  }
  let start = range.start;
  let end = range.end;
  while (start < end && isValidRangeMatch(paragraphs.slice(start, end).join('\n\n').trim(), quote, exactMatcher)) {
    end -= 1;
  }
  while (start < end && isValidRangeMatch(paragraphs.slice(start + 1, end + 1).join('\n\n').trim(), quote, exactMatcher)) {
    start += 1;
  }
  return { start, end };
}

export function shrinkMatchedLines(raw: string, quote: string, exactMatcher: RegExp | null) {
  if (!exactMatcher) {
    return raw.trim();
  }
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length <= 1) {
    return raw.trim();
  }
  let start = 0;
  let end = lines.length - 1;
  while (start < end && isValidRangeMatch(lines.slice(start, end).join('\n').trim(), quote, exactMatcher)) {
    end -= 1;
  }
  while (start < end && isValidRangeMatch(lines.slice(start + 1, end + 1).join('\n').trim(), quote, exactMatcher)) {
    start += 1;
  }
  return lines.slice(start, end + 1).join('\n').trim();
}

export function toTrimmedMatch(raw: string, quote: string, anchorFragment: string, exactMatcher: RegExp | null) {
  return shrinkMatchedLines(trimMatchedExcerpt(raw, quote, anchorFragment), quote, exactMatcher);
}

function shouldPreferTrimmedLocatorText(quote: string) {
  const normalized = quote.replace(/\r\n?/g, '\n');
  return normalized.includes('\n');
}

export function toLocatedMatch(raw: string, quote: string, _anchorFragment: string, exactMatcher: RegExp | null) {
  if (shouldPreferTrimmedLocatorText(quote)) {
    return shrinkMatchedLines(trimMatchedExcerpt(raw, quote, _anchorFragment), quote, exactMatcher);
  }
  return shrinkMatchedLines(raw, quote, exactMatcher);
}
