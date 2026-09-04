import { createContextExcerptLocator, type ContextExcerptLocator } from '../import/contextExcerptLocator.js';
import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { collectBoundaryFragments } from '../import/controlledContextText.js';
import { trimMatchedExcerpt } from '../import/controlledContextTrim.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate
} from '../import/highlightExcerptMatch.js';

export interface AnchoredImportedHighlightRecord extends PreparedImportHighlightRecord {
  anchorId: string;
  from?: number;
  kind: 'highlight' | 'cloze';
  to?: number;
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

export function resolveInitialSearchFrom(content: string) {
  const frontmatterMatch = /^---\n[\s\S]*?\n---(?:\n+|$)/.exec(normalizeLineEndings(content));
  return frontmatterMatch ? frontmatterMatch[0].length : 0;
}

function normalizeLooseWhitespaceWithMap(value: string) {
  const raw = normalizeLineEndings(value);
  let normalized = '';
  const rawIndexes: number[] = [];
  let pendingWhitespaceStart: number | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === undefined) {
      continue;
    }
    if (/\s/.test(character)) {
      if (pendingWhitespaceStart === null) {
        pendingWhitespaceStart = index;
      }
      continue;
    }

    if (pendingWhitespaceStart !== null && normalized.length > 0) {
      normalized += ' ';
      rawIndexes.push(pendingWhitespaceStart);
      pendingWhitespaceStart = null;
    }

    normalized += character;
    rawIndexes.push(index);
  }

  return { normalized: normalized.trim(), rawIndexes };
}

function findAvailableOccurrence(
  content: string,
  excerpt: string,
  minSearchFrom: number,
  searchFrom: number,
  occupiedRanges: Array<{ from: number; to: number }>
) {
  const attempts = [Math.max(searchFrom, minSearchFrom), minSearchFrom];
  for (const startFrom of attempts) {
    let startIndex = startFrom;
    while (startIndex <= content.length) {
      const foundAt = content.indexOf(excerpt, startIndex);
      if (foundAt < 0) {
        break;
      }
      const candidate = { from: foundAt, to: foundAt + excerpt.length };
      const overlaps = occupiedRanges.some((range) => candidate.from < range.to && candidate.to > range.from);
      if (!overlaps) {
        return candidate;
      }
      startIndex = foundAt + 1;
    }
  }
  const normalizedContent = normalizeLooseWhitespaceWithMap(content);
  const normalizedExcerpt = normalizeLooseWhitespaceWithMap(excerpt).normalized;
  if (!normalizedContent.normalized || !normalizedExcerpt) {
    return null;
  }
  for (const startFrom of attempts) {
    let normalizedStartIndex = normalizedContent.rawIndexes.findIndex((index) => index >= Math.max(startFrom, minSearchFrom));
    if (normalizedStartIndex < 0) {
      normalizedStartIndex = normalizedContent.rawIndexes.findIndex((index) => index >= minSearchFrom);
    }
    while (normalizedStartIndex <= normalizedContent.normalized.length) {
      const foundAt = normalizedContent.normalized.indexOf(normalizedExcerpt, normalizedStartIndex);
      if (foundAt < 0) {
        break;
      }
      const rawStart = normalizedContent.rawIndexes[foundAt];
      const rawEnd = normalizedContent.rawIndexes[foundAt + normalizedExcerpt.length - 1];
      if (rawStart === undefined || rawEnd === undefined) {
        break;
      }
      const candidate = { from: rawStart, to: rawEnd + 1 };
      const overlaps = occupiedRanges.some((range) => candidate.from < range.to && candidate.to > range.from);
      if (!overlaps) {
        return candidate;
      }
      normalizedStartIndex = foundAt + 1;
    }
  }
  return null;
}

function isUntrimmedLocatorCandidate(candidate: string, locatorText: string, highlightText: string) {
  const normalizedCandidate = candidate.trim();
  const normalizedLocator = locatorText.trim();
  return normalizedCandidate === normalizedLocator && normalizedCandidate.length >= 120 && normalizedCandidate.length > highlightText.length * 3;
}

function stripEmptyLinks(value: string) {
  return value.replace(/\[]\([^)]+\)/g, '').trim();
}

function resolveFullLocatorCandidate(highlightText: string, locatorText: string) {
  if (!locatorText.includes('\n')) {
    return [];
  }
  const firstHighlightLine = stripEmptyLinks(highlightText.split('\n').find((line) => line.trim().length > 0) ?? '');
  const firstLocatorLine = locatorText.split('\n')[0] ?? '';
  if (!firstHighlightLine) {
    return [locatorText];
  }
  const firstLineOffset = firstLocatorLine.indexOf(firstHighlightLine);
  return [firstLineOffset > 0 ? locatorText.slice(firstLineOffset) : locatorText];
}

function collectNormalizedSourceCandidates(
  locator: ContextExcerptLocator,
  candidates: string[]
) {
  return candidates
    .map((candidate) => {
      const prepared = prepareHighlightExcerptCandidate({ text: candidate });
      return findPreparedHighlightExcerptInLocator(locator, prepared);
    })
    .filter((candidate): candidate is string => Boolean(candidate));
}

function collectAnchorExcerptCandidates(locator: ContextExcerptLocator, highlight: PreparedImportHighlightRecord) {
  const highlightText = highlight.content.replace(/\n※ [\s\S]*$/u, '').trim();
  const candidates = [highlightText, highlight.content.trim()];
  const fullLocatorCandidates = highlight.locatorText ? resolveFullLocatorCandidate(highlightText, highlight.locatorText) : [];
  const locatorCandidates = highlight.locatorText
    ? [
        ...fullLocatorCandidates,
        ...collectBoundaryFragments(highlightText)
          .map((fragment) => trimMatchedExcerpt(highlight.locatorText ?? '', highlightText, fragment))
          .filter((candidate) => !isUntrimmedLocatorCandidate(candidate, highlight.locatorText ?? '', highlightText))
      ]
    : [];
  candidates.push(...locatorCandidates);
  const directCandidates = Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
  return Array.from(new Set([...directCandidates, ...collectNormalizedSourceCandidates(locator, directCandidates)]));
}

export function applyImportedHighlightAnchors(input: {
  content: string;
  highlights: PreparedImportHighlightRecord[] | undefined;
}) {
  const content = input.content;
  if (!input.highlights?.length) {
    return { content, highlights: [] as AnchoredImportedHighlightRecord[] };
  }

  const minSearchFrom = resolveInitialSearchFrom(content);
  let searchFrom = minSearchFrom;
  const occupiedRanges: Array<{ from: number; to: number }> = [];
  const locatedHighlights: AnchoredImportedHighlightRecord[] = [];
  const locator = createContextExcerptLocator(content);

  input.highlights.forEach((highlight) => {
    if (!highlight.content.trim()) {
      return;
    }
    const range = collectAnchorExcerptCandidates(locator, highlight)
      .map((excerpt) => findAvailableOccurrence(content, excerpt, minSearchFrom, searchFrom, occupiedRanges))
      .find((candidate) => candidate !== null);
    if (!range) {
      return;
    }
    const anchorId = `imported-highlight-${crypto.randomUUID()}`;
    searchFrom = range.to;
    occupiedRanges.push(range);
    locatedHighlights.push({
      ...highlight,
      anchorId,
      ...range,
      kind: 'highlight',
      locatorText: content.slice(range.from, range.to)
    });
  });

  return {
    content,
    highlights: locatedHighlights.sort((left, right) => {
      const leftFrom = left.from ?? Number.MAX_SAFE_INTEGER;
      const rightFrom = right.from ?? Number.MAX_SAFE_INTEGER;
      if (leftFrom !== rightFrom) {
        return leftFrom - rightFrom;
      }
      const leftTo = left.to ?? Number.MAX_SAFE_INTEGER;
      const rightTo = right.to ?? Number.MAX_SAFE_INTEGER;
      return leftTo - rightTo;
    })
  };
}
