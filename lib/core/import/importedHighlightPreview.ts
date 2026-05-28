import type { NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

import type { PreparedImportHighlightRecord } from './contract.js';

const PREVIEW_CONTEXT_RADIUS = 80;
const PREVIEW_EXCERPT_MAX_LENGTH = 220;
const HIGHLIGHT_NOTE_PATTERN = /\n※ [\s\S]*$/u;

function selectPreviewHighlights<T>(items: T[]) {
  if (items.length <= 3) {
    return items;
  }
  return [items[0], items[1], items.at(-1)].filter((value): value is T => Boolean(value));
}

function stripHighlightNote(content: string) {
  return content.replace(HIGHLIGHT_NOTE_PATTERN, '').trim();
}

function truncateAroundMatch(text: string, matchIndex: number, highlightText: string) {
  const start = Math.max(0, matchIndex - PREVIEW_CONTEXT_RADIUS);
  const end = Math.min(text.length, matchIndex + highlightText.length + PREVIEW_CONTEXT_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function findMatchIndex(text: string, highlightText: string) {
  return text.toLocaleLowerCase().indexOf(highlightText.toLocaleLowerCase());
}

function findParagraphMatch(content: string, highlightText: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => findMatchIndex(paragraph, highlightText) >= 0);
}

function buildMatchedExcerpt(input: {
  content: string;
  highlightText: string;
  locatorText?: string | null;
}) {
  const locator = input.locatorText?.trim();
  const locatorMatchIndex = locator ? findMatchIndex(locator, input.highlightText) : -1;
  if (locator && locatorMatchIndex >= 0) {
    return truncateAroundMatch(locator, locatorMatchIndex, input.highlightText);
  }
  const paragraph = findParagraphMatch(input.content, input.highlightText);
  if (paragraph) {
    return truncateAroundMatch(paragraph, findMatchIndex(paragraph, input.highlightText), input.highlightText);
  }
  return input.highlightText;
}

export function buildImportedHighlightPreview(input: { content: string; sourceName: string }) {
  void input;
  return {
    detectedHighlightCount: 0,
    samples: [] as NativeReadwiseDetectionSample[]
  };
}

export function buildImportedHighlightPreviewFromMatches(input: {
  content: string;
  matchedHighlights?: PreparedImportHighlightRecord[];
  unmatchedHighlights?: PreparedImportHighlightRecord[];
  sourceName: string;
}) {
  const highlights = [
    ...(input.matchedHighlights ?? []).map((highlight) => ({ highlight, matched: true })),
    ...(input.unmatchedHighlights ?? []).map((highlight) => ({ highlight, matched: false }))
  ];
  if (highlights.length > 0) {
    const samples: NativeReadwiseDetectionSample[] = selectPreviewHighlights(highlights).map(({ highlight, matched }) => {
      const highlightText = stripHighlightNote(highlight.content);
      return {
        excerpt: matched
          ? buildMatchedExcerpt({
              content: input.content,
              highlightText,
              ...(highlight.locatorText === undefined ? {} : { locatorText: highlight.locatorText })
            }).slice(0, PREVIEW_EXCERPT_MAX_LENGTH)
          : '',
        highlightText,
        matched,
        sourceName: input.sourceName
      };
    });
    return {
      detectedHighlightCount: highlights.length,
      samples
    };
  }
  return buildImportedHighlightPreview(input);
}
