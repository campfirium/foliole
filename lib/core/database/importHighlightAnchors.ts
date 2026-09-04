import { createContextExcerptLocator, type ContextExcerptLocator } from '../import/contextExcerptLocator.js';
import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { collectBoundaryFragments } from '../import/controlledContextText.js';
import { trimMatchedExcerpt } from '../import/controlledContextTrim.js';
import {
  findPreparedHighlightExcerptInLocator,
  prepareHighlightExcerptCandidate
} from '../import/highlightExcerptMatch.js';

import {
  classifyImportedBodyCandidate,
  findUniqueAvailableImportedBodyOccurrence
} from './importHighlightBodyMatching.js';

export interface AnchoredImportedHighlightRecord extends PreparedImportHighlightRecord {
  anchorId: string;
  from?: number;
  kind: 'highlight' | 'cloze';
  to?: number;
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

  const occupiedRanges: Array<{ from: number; to: number }> = [];
  const locatedHighlights: AnchoredImportedHighlightRecord[] = [];
  const locator = createContextExcerptLocator(content);

  input.highlights.forEach((highlight) => {
    if (!highlight.content.trim()) {
      return;
    }
    const highlightText = highlight.content.replace(/\n※ [\s\S]*$/u, '').trim();
    if (classifyImportedBodyCandidate(content, highlightText).status === 'ambiguous') {
      return;
    }
    const range = collectAnchorExcerptCandidates(locator, highlight)
      .map((excerpt) => findUniqueAvailableImportedBodyOccurrence(content, excerpt, occupiedRanges))
      .find((candidate) => candidate !== null);
    if (!range) {
      return;
    }
    const anchorId = `imported-highlight-${crypto.randomUUID()}`;
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
