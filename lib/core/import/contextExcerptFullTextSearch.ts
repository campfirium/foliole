import { normalizeLineEndings, normalizeQuoteText, type ContextExcerptQuoteLocator } from './contextExcerptQuoteLocator.js';

const MAX_LENGTH_DELTA = 6;

interface FullTextLocator {
  content: string;
  normalizedFullText: string;
  normalizedFullTextRawIndexes: number[];
}

interface Range {
  end: number;
  start: number;
}

function toRawRange(locator: FullTextLocator, start: number, endExclusive: number) {
  const rawStart = locator.normalizedFullTextRawIndexes[start];
  const rawEnd = locator.normalizedFullTextRawIndexes[endExclusive - 1];
  if (rawStart === undefined || rawEnd === undefined) {
    return null;
  }
  return { end: rawEnd + 1, start: expandRawStartToLinkLabelStart(locator.content, rawStart) };
}

function expandRawStartToLinkLabelStart(content: string, rawStart: number) {
  const lineStart = content.lastIndexOf('\n', rawStart - 1) + 1;
  const linkStart = content.lastIndexOf('[', rawStart);
  if (linkStart < lineStart || content[linkStart - 1] === '!') {
    return rawStart;
  }
  const labelEnd = content.indexOf(']', linkStart + 1);
  if (labelEnd < rawStart || content[labelEnd + 1] !== '(') {
    return rawStart;
  }
  return linkStart;
}

function collectStringRanges(haystack: string, needle: string) {
  const ranges: Range[] = [];
  let start = 0;
  while (start < haystack.length) {
    const foundAt = haystack.indexOf(needle, start);
    if (foundAt < 0) {
      return ranges;
    }
    ranges.push({ end: foundAt + needle.length, start: foundAt });
    start = foundAt + 1;
  }
  return ranges;
}

function collectRegexRanges(haystack: string, matcher: RegExp) {
  const flags = matcher.flags.includes('g') ? matcher.flags : `${matcher.flags}g`;
  const globalMatcher = new RegExp(matcher.source, flags);
  const ranges: Range[] = [];
  for (const match of haystack.matchAll(globalMatcher)) {
    if (match.index === undefined || match[0].length === 0) {
      continue;
    }
    ranges.push({ end: match.index + match[0].length, start: match.index });
    if (ranges.length > 1) {
      return ranges;
    }
  }
  return ranges;
}

function sliceRaw(locator: FullTextLocator, range: Range) {
  return locator.content.slice(range.start, range.end).trim();
}

function isLengthClose(match: string, quote: string) {
  const left = normalizeQuoteText(match).length;
  const right = normalizeQuoteText(quote).length;
  return Math.abs(left - right) <= MAX_LENGTH_DELTA;
}

function containsOrderedQuoteParts(match: string, quote: string) {
  const normalizedMatch = normalizeQuoteText(match);
  let cursor = 0;
  for (const rawLine of normalizeLineEndings(quote).split('\n')) {
    const line = normalizeQuoteText(rawLine);
    if (!line) {
      continue;
    }
    const foundAt = normalizedMatch.indexOf(line, cursor);
    if (foundAt < 0) {
      return false;
    }
    cursor = foundAt + line.length;
  }
  return true;
}

function uniqueValidRawMatch(locator: FullTextLocator, ranges: Range[], quote: string, exactMatcher: RegExp | null) {
  const validRanges = ranges
    .map((range) => toRawRange(locator, range.start, range.end))
    .filter((range): range is Range => range !== null)
    .filter((range) => {
      const match = sliceRaw(locator, range);
      return containsOrderedQuoteParts(match, quote) && (exactMatcher?.test(match) || isLengthClose(match, quote));
    });
  return validRanges.length === 1 ? sliceRaw(locator, validRanges[0]) : null;
}

function collectBoundaryFragments(normalizedQuote: string) {
  const unique = new Set<string>();
  const fragments: string[] = [];
  for (const fragment of normalizedQuote.split(/[\s。！？!?；;：:，,、•✔❌]+/u)) {
    const normalized = fragment.trim().toLocaleLowerCase();
    if (normalized.length < 4 || unique.has(normalized)) {
      continue;
    }
    unique.add(normalized);
    fragments.push(normalized);
  }
  return fragments;
}

function collectFragmentRanges(locator: FullTextLocator, quoteLocator: ContextExcerptQuoteLocator) {
  const haystack = locator.normalizedFullText.toLocaleLowerCase();
  const fragments = collectBoundaryFragments(quoteLocator.normalizedQuote);
  const ranges: Range[] = [];
  for (let startIndex = 0; startIndex < fragments.length; startIndex += 1) {
    const startFragment = fragments[startIndex];
    const startRanges = collectStringRanges(haystack, startFragment);
    for (let endIndex = fragments.length - 1; endIndex >= startIndex; endIndex -= 1) {
      const endFragment = fragments[endIndex];
      const endRanges = collectStringRanges(haystack, endFragment);
      for (const startRange of startRanges) {
        for (const endRange of endRanges) {
          if (endRange.end < startRange.start) {
            continue;
          }
          ranges.push({ end: endRange.end, start: startRange.start });
          if (ranges.length > 24) {
            return ranges;
          }
        }
      }
    }
  }
  return ranges;
}

export function findFullTextLocatorMatch(
  locator: FullTextLocator,
  quote: string,
  quoteLocator: ContextExcerptQuoteLocator
) {
  const exactRanges = collectStringRanges(locator.normalizedFullText, quoteLocator.normalizedQuote);
  const exactMatch = uniqueValidRawMatch(locator, exactRanges, quote, quoteLocator.exactMatcher);
  if (exactMatch) {
    return exactMatch;
  }
  if (quoteLocator.exactMatcher) {
    const regexMatch = uniqueValidRawMatch(
      locator,
      collectRegexRanges(locator.normalizedFullText, quoteLocator.exactMatcher),
      quote,
      quoteLocator.exactMatcher
    );
    if (regexMatch) {
      return regexMatch;
    }
  }
  return uniqueValidRawMatch(locator, collectFragmentRanges(locator, quoteLocator), quote, quoteLocator.exactMatcher);
}
