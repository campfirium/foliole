import type { PreparedImportHighlightRecord } from '../import/contract.js';

export interface AnchoredImportedHighlightRecord extends PreparedImportHighlightRecord {
  anchorId: string;
}

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
  const pattern = /<highlight id="([1-9]\d*)">([\s\S]*?)<\/highlight id="\1">/g;
  return [...content.matchAll(pattern)]
    .map<AnchoredImportedHighlightRecord | null>((match) => {
      const anchorId = match[1] ?? '';
      const highlightContent = (match[2] ?? '').replace(/<\/?(?:highlight|cloze)\s+id="[^"]+"\s*>/g, '').trim();
      if (!anchorId || !highlightContent) {
        return null;
      }
      return {
        anchorId,
        content: highlightContent,
        label: null
      };
    })
    .filter((highlight): highlight is AnchoredImportedHighlightRecord => highlight !== null);
}

function findNextAnchorNumericId(content: string) {
  let maxId = 0;
  for (const match of content.matchAll(/<(?:highlight|cloze)\s+id="([1-9]\d*)"\s*>/g)) {
    const id = Number.parseInt(match[1] ?? '', 10);
    if (Number.isFinite(id) && id > maxId) {
      maxId = id;
    }
  }
  return maxId + 1;
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
  if (!input.highlights?.length) {
    return { content: input.content, highlights: [] satisfies AnchoredImportedHighlightRecord[] };
  }

  let nextAnchorId = findNextAnchorNumericId(input.content);
  let searchFrom = 0;
  const occupiedRanges: Array<{ from: number; to: number }> = [];
  const locatedHighlights: Array<AnchoredImportedHighlightRecord & { from: number; to: number }> = [];

  input.highlights.forEach((highlight) => {
    const excerpt = highlight.content.trim();
    if (!excerpt) {
      return;
    }
    const range = findAvailableOccurrence(input.content, excerpt, searchFrom, occupiedRanges);
    if (!range) {
      return;
    }
    const anchorId = String(nextAnchorId);
    nextAnchorId += 1;
    searchFrom = range.to;
    occupiedRanges.push(range);
    locatedHighlights.push({ ...highlight, anchorId, ...range });
  });

  let anchoredContent = input.content;
  [...locatedHighlights]
    .sort((left, right) => right.from - left.from)
    .forEach((highlight) => {
      anchoredContent =
        `${anchoredContent.slice(0, highlight.from)}<highlight id="${highlight.anchorId}">` +
        `${anchoredContent.slice(highlight.from, highlight.to)}` +
        `</highlight id="${highlight.anchorId}">${anchoredContent.slice(highlight.to)}`;
    });

  return {
    content: anchoredContent,
    highlights: locatedHighlights.map(({ anchorId, content, label }) => ({ anchorId, content, label }))
  };
}
