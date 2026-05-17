import { normalizeQuoteLines, normalizeQuoteText, type ContextExcerptQuoteLocator } from './contextExcerptQuoteLocator.js';
import { canSkipFullTextLocatorSearch } from './contextExcerptSearchGate.js';

const MAX_LENGTH_DELTA = 6;
const MAX_ORDERED_LINE_RANGES = 64;

interface FullTextLocator {
  content: string;
  normalizedFullText: string;
  normalizedFullTextLower?: string;
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
  const linkStart = expandRawStartToMarkdownLinkStart(locator.content, rawStart);
  const headingStart = expandRawStartToHeadingStart(locator.content, linkStart);
  const expandedStart = expandRawStartToInlineCodeStart(locator.content, headingStart);
  return {
    end: expandRawEndToAutolinkEnd(locator.content, rawEnd),
    start: expandedStart
  };
}

function expandRawStartToHeadingStart(content: string, rawStart: number) {
  const lineStart = content.lastIndexOf('\n', rawStart - 1) + 1;
  const prefix = content.slice(lineStart, rawStart);
  return /^#{1,6}\s+$/u.test(prefix) ? lineStart : rawStart;
}

function expandRawStartToMarkdownLinkStart(content: string, rawStart: number) {
  return content[rawStart - 1] === '[' && content[rawStart - 2] !== '!' ? rawStart - 1 : rawStart;
}

function isSingleBacktickAt(content: string, index: number) {
  return content[index] === '`' && content[index - 1] !== '`' && content[index + 1] !== '`';
}

function expandRawStartToInlineCodeStart(content: string, rawStart: number) {
  return isSingleBacktickAt(content, rawStart - 1) ? rawStart - 1 : rawStart;
}

function expandRawEndToAutolinkEnd(content: string, rawEnd: number) {
  const nextIndex = rawEnd + 1;
  if (isSingleBacktickAt(content, nextIndex)) {
    return nextIndex + 1;
  }
  const markdownLinkEnd = findMarkdownLinkEndAtLabelEnd(content, nextIndex);
  if (markdownLinkEnd !== null) {
    return markdownLinkEnd;
  }
  if (content[nextIndex] !== '>') {
    return nextIndex;
  }
  const lineStart = content.lastIndexOf('\n', rawEnd) + 1;
  const autolinkStart = content.lastIndexOf('<', rawEnd);
  return autolinkStart >= lineStart ? nextIndex + 1 : nextIndex;
}

function findMarkdownLinkEndAtLabelEnd(content: string, nextIndex: number) {
  if (content[nextIndex] !== ']' || content[nextIndex + 1] !== '(') {
    return null;
  }
  const linkEnd = content.indexOf(')', nextIndex + 2);
  return linkEnd >= 0 ? linkEnd + 1 : null;
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
  for (const line of normalizeQuoteLines(quote)) {
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
  const onlyRange = validRanges[0];
  return validRanges.length === 1 && onlyRange ? sliceRaw(locator, onlyRange) : null;
}

function collectOrderedLineRanges(locator: FullTextLocator, quote: string) {
  const lines = normalizeQuoteLines(quote).filter((line) => line.length > 0);
  const firstLine = lines[0];
  if (!firstLine) {
    return [];
  }
  const lastLine = lines[lines.length - 1] ?? firstLine;
  const starts = collectStringRanges(locator.normalizedFullText, firstLine).slice(0, MAX_ORDERED_LINE_RANGES);
  const ranges: Range[] = [];
  for (const start of starts) {
    const lastLineAt = locator.normalizedFullText.indexOf(lastLine, start.end);
    if (lastLineAt >= 0) {
      ranges.push({ end: lastLineAt + lastLine.length, start: start.start });
    }
  }
  return ranges;
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
  const haystack = locator.normalizedFullTextLower ?? locator.normalizedFullText.toLocaleLowerCase();
  const fragments = collectBoundaryFragments(quoteLocator.normalizedQuote);
  const ranges: Range[] = [];
  for (let startIndex = 0; startIndex < fragments.length; startIndex += 1) {
    const startFragment = fragments[startIndex];
    if (!startFragment) {
      continue;
    }
    const startRanges = collectStringRanges(haystack, startFragment);
    for (let endIndex = fragments.length - 1; endIndex >= startIndex; endIndex -= 1) {
      const endFragment = fragments[endIndex];
      if (!endFragment) {
        continue;
      }
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
  if (canSkipFullTextLocatorSearch(locator, quoteLocator)) {
    return null;
  }
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
  const orderedLineMatch = uniqueValidRawMatch(locator, collectOrderedLineRanges(locator, quote), quote, quoteLocator.exactMatcher);
  if (orderedLineMatch) {
    return orderedLineMatch;
  }
  return uniqueValidRawMatch(locator, collectFragmentRanges(locator, quoteLocator), quote, quoteLocator.exactMatcher);
}
