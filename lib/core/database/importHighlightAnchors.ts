import type { PreparedImportHighlightRecord } from '../import/contract.js';

export interface AnchoredImportedHighlightRecord extends PreparedImportHighlightRecord {
  anchorId: string;
  from?: number;
  kind: 'highlight' | 'cloze';
  to?: number;
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

function parseImportedAnchorTags(content: string) {
  const tagPattern = /<(\/?)(highlight|cloze) id="([^"]+)">/g;
  const parsedHighlights: AnchoredImportedHighlightRecord[] = [];
  const activeAnchors: Array<{
    anchorId: string;
    content: string;
    from: number;
    kind: 'highlight' | 'cloze';
  }> = [];
  let pureContent = '';
  let lastIndex = 0;

  for (const match of content.matchAll(tagPattern)) {
    const tagStart = match.index ?? 0;
    const text = content.slice(lastIndex, tagStart);
    pureContent += text;
    for (const anchor of activeAnchors) {
      anchor.content += text;
    }

    const isClosing = match[1] === '/';
    const kind = match[2] as 'highlight' | 'cloze';
    const anchorId = match[3] ?? '';
    if (isClosing) {
      const activeIndex = activeAnchors.findIndex((anchor) => anchor.anchorId === anchorId);
      const [anchor] = activeIndex >= 0 ? activeAnchors.splice(activeIndex, 1) : [];
      if (anchor) {
        parsedHighlights.push({
          anchorId: anchor.anchorId,
          content: anchor.content,
          from: anchor.from,
          kind: anchor.kind,
          label: null,
          locatorText: anchor.content,
          to: pureContent.length
        });
      }
    } else {
      activeAnchors.push({
        anchorId,
        content: '',
        from: pureContent.length,
        kind
      });
    }
    lastIndex = tagStart + match[0].length;
  }

  if (lastIndex === 0) {
    return null;
  }
  const tail = content.slice(lastIndex);
  pureContent += tail;
  for (const anchor of activeAnchors) {
    anchor.content += tail;
  }
  return { content: pureContent, highlights: parsedHighlights };
}

export function applyImportedHighlightAnchors(input: {
  content: string;
  highlights: PreparedImportHighlightRecord[] | undefined;
}) {
  const content = input.content;
  if (!input.highlights?.length) {
    return parseImportedAnchorTags(content) ?? { content, highlights: [] as AnchoredImportedHighlightRecord[] };
  }

  let searchFrom = 0;
  const occupiedRanges: Array<{ from: number; to: number }> = [];
  const locatedHighlights: AnchoredImportedHighlightRecord[] = [];

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
