import {
  createContextExcerptQuoteLocator,
  normalizeLineEndings,
  type ContextExcerptQuoteLocator
} from './contextExcerptQuoteLocator.js';
import { trimMatchedExcerpt } from './controlledContextTrim.js';

function splitParagraphs(content: string) {
  return normalizeLineEndings(content)
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean);
}

function findParagraphIndexesContaining(paragraphs: string[], matcher: RegExp) {
  const indexes: number[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (matcher.test(paragraph)) {
      indexes.push(index);
    }
  });
  return indexes;
}

function joinParagraphRange(paragraphs: string[], startIndex: number, endIndex: number) {
  return paragraphs
    .slice(startIndex, endIndex + 1)
    .join('\n\n')
    .trim();
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

function tryExactMatch(locator: ContextExcerptLocator, quote: string, quoteLocator: ContextExcerptQuoteLocator) {
  if (!quoteLocator.exactMatcher) {
    return null;
  }
  const indexes = findParagraphIndexesContaining(locator.paragraphs, quoteLocator.exactMatcher);
  if (indexes.length !== 1) {
    return null;
  }
  return shrinkMatchedLines(
    trimMatchedExcerpt(locator.paragraphs[indexes[0]], quote, quoteLocator.normalizedQuote),
    quoteLocator.exactMatcher
  );
}

function tryUniqueFragmentMatch(locator: ContextExcerptLocator, quote: string, quoteLocator: ContextExcerptQuoteLocator) {
  for (const fragment of quoteLocator.fragmentMatchers) {
    const indexes = findParagraphIndexesContaining(locator.paragraphs, fragment.matcher);
    if (indexes.length === 1) {
      return shrinkMatchedLines(
        trimMatchedExcerpt(locator.paragraphs[indexes[0]], quote, fragment.fragment),
        quoteLocator.exactMatcher
      );
    }
  }
  return null;
}

function resolveBestNearbyRange(locator: ContextExcerptLocator, quoteLocator: ContextExcerptQuoteLocator) {
  const candidates = quoteLocator.fragmentMatchers
    .map((fragment) => ({
      fragment,
      indexes: findParagraphIndexesContaining(locator.paragraphs, fragment.matcher)
    }))
    .filter((candidate) => candidate.indexes.length > 1 && candidate.indexes.length <= 12);

  let bestRange: { anchorFragment: string; end: number; start: number } | null = null;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
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
        anchorFragment: left.fragment.fragment,
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

function tryNearbyRangeMatch(locator: ContextExcerptLocator, quote: string, quoteLocator: ContextExcerptQuoteLocator) {
  const bestRange = resolveBestNearbyRange(locator, quoteLocator);
  if (!bestRange) {
    return null;
  }
  const narrowed = shrinkRangeToMinimumMatch(locator.paragraphs, bestRange, quoteLocator.exactMatcher);
  const raw = joinParagraphRange(locator.paragraphs, narrowed.start, narrowed.end);
  return shrinkMatchedLines(trimMatchedExcerpt(raw, quote, bestRange.anchorFragment), quoteLocator.exactMatcher);
}

export interface ContextExcerptLocator {
  paragraphs: string[];
}

export function createContextExcerptLocator(content: string): ContextExcerptLocator {
  return { paragraphs: splitParagraphs(content) };
}

export { createContextExcerptQuoteLocator, type ContextExcerptQuoteLocator };

export function findContextExcerptInLocatorByQuoteLocator(
  locator: ContextExcerptLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  return (
    tryExactMatch(locator, quote, quoteLocator) ??
    tryUniqueFragmentMatch(locator, quote, quoteLocator) ??
    tryNearbyRangeMatch(locator, quote, quoteLocator)
  );
}

export function findContextExcerptInLocator(locator: ContextExcerptLocator, quote: string) {
  const quoteLocator = createContextExcerptQuoteLocator(quote);
  if (!quoteLocator) {
    return null;
  }
  return findContextExcerptInLocatorByQuoteLocator(locator, quote, quoteLocator);
}
