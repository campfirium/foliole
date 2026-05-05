import type { PreparedImportHighlightRecord } from '../import/contract.js';
import { extractImportedAnchorBlocks, stripImportedAnchorMarkup } from '../import/importAnchorMarkup.js';

export interface AnchoredImportedHighlightRecord extends PreparedImportHighlightRecord {
  anchorId: string;
  from?: number;
  kind: 'highlight' | 'cloze';
  to?: number;
}

const INLINE_ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)\b[^>]*>/g;

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n');
}

function normalizeLooseWhitespaceWithMap(value: string) {
  const raw = normalizeLineEndings(value);
  let normalized = '';
  const rawIndexes: number[] = [];
  let pendingWhitespaceStart: number | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
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

export function collectAnchoredImportedHighlights(content: string) {
  const projection = projectInlineAnchorContent(content);
  return extractImportedAnchorBlocks(content)
    .map<AnchoredImportedHighlightRecord | null>((block) => {
      const anchorContent = stripImportedAnchorMarkup(content.slice(block.contentFrom, block.contentTo)).trim();
      if (!block.id || !anchorContent) {
        return null;
      }
      return {
        anchorId: block.id,
        content: anchorContent,
        from: projection.rawToVisible[block.contentFrom] ?? 0,
        kind: block.kind,
        label: null,
        locatorText: anchorContent,
        to: projection.rawToVisible[block.contentTo] ?? 0
      };
    })
    .filter((highlight): highlight is AnchoredImportedHighlightRecord => highlight !== null);
}

function projectInlineAnchorContent(content: string) {
  const rawToVisible: number[] = Array.from({ length: content.length + 1 }, () => 0);
  let rawCursor = 0;
  let visibleCursor = 0;

  for (const match of content.matchAll(INLINE_ANCHOR_TAG_PATTERN)) {
    const tagFrom = match.index ?? -1;
    const tagText = match[0] ?? '';
    const tagTo = tagFrom < 0 ? -1 : tagFrom + tagText.length;
    if (tagFrom < 0 || tagTo < 0) {
      continue;
    }

    while (rawCursor < tagFrom) {
      rawToVisible[rawCursor] = visibleCursor;
      rawCursor += 1;
      visibleCursor += 1;
    }
    while (rawCursor < tagTo) {
      rawToVisible[rawCursor] = visibleCursor;
      rawCursor += 1;
    }
  }

  while (rawCursor < content.length) {
    rawToVisible[rawCursor] = visibleCursor;
    rawCursor += 1;
    visibleCursor += 1;
  }

  rawToVisible[content.length] = visibleCursor;
  return { rawToVisible };
}

function findAvailableOccurrence(
  content: string,
  excerpt: string,
  searchFrom: number,
  occupiedRanges: Array<{ from: number; to: number }>
) {
  const attempts = [searchFrom, 0];
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
    let normalizedStartIndex = normalizedContent.rawIndexes.findIndex((index) => index >= startFrom);
    if (normalizedStartIndex < 0) {
      normalizedStartIndex = 0;
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

export function applyImportedHighlightAnchors(input: {
  content: string;
  highlights: PreparedImportHighlightRecord[] | undefined;
}) {
  const content = stripImportedAnchorMarkup(input.content);
  const inlineAnchors = collectAnchoredImportedHighlights(input.content);
  if (!input.highlights?.length) {
    return { content, highlights: inlineAnchors };
  }

  let searchFrom = inlineAnchors.reduce((max, highlight) => Math.max(max, highlight.to ?? 0), 0);
  const occupiedRanges: Array<{ from: number; to: number }> = inlineAnchors
    .filter((highlight) => typeof highlight.from === 'number' && typeof highlight.to === 'number')
    .map((highlight) => ({ from: highlight.from ?? 0, to: highlight.to ?? 0 }));
  const locatedHighlights: AnchoredImportedHighlightRecord[] = [...inlineAnchors];

  input.highlights.forEach((highlight) => {
    const excerpt = (highlight.locatorText ?? highlight.content).trim();
    if (!excerpt) {
      return;
    }
    const range = findAvailableOccurrence(content, excerpt, searchFrom, occupiedRanges);
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
