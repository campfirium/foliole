export interface ImportedBodyRange {
  from: number;
  to: number;
}

export type ImportedBodyMatch =
  | { range: ImportedBodyRange; status: 'unique' }
  | { range: null; status: 'ambiguous' | 'missing' };

function resolveFrontmatterEnd(content: string) {
  const match = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u.exec(content);
  return match?.[0].length ?? 0;
}

function resolveFirstHeadingEnd(content: string, from: number) {
  const match = /^(?:[ \t]*\r?\n)*[ \t]{0,3}#[ \t]+[^\r\n]*(?:(?:\r?\n)+|$)/u.exec(content.slice(from));
  return match ? from + match[0].length : from;
}

export function resolveImportedBodySearchFrom(content: string) {
  return resolveFirstHeadingEnd(content, resolveFrontmatterEnd(content));
}

function findExactOccurrences(content: string, excerpt: string, from: number) {
  const occurrences: ImportedBodyRange[] = [];
  let index = content.indexOf(excerpt, from);
  while (index >= 0) {
    occurrences.push({ from: index, to: index + excerpt.length });
    if (occurrences.length > 1) break;
    index = content.indexOf(excerpt, index + 1);
  }
  return occurrences;
}

export function classifyImportedBodyOccurrence(content: string, excerpt: string): ImportedBodyMatch {
  if (!excerpt) return { range: null, status: 'missing' };
  const matches = findExactOccurrences(content, excerpt, resolveImportedBodySearchFrom(content));
  if (matches.length === 0) return { range: null, status: 'missing' };
  if (matches.length > 1) return { range: null, status: 'ambiguous' };
  const range = matches[0];
  return range ? { range, status: 'unique' } : { range: null, status: 'missing' };
}

export function findUniqueImportedBodyOccurrence(content: string, excerpt: string) {
  return classifyImportedBodyOccurrence(content, excerpt).range;
}

function normalizeLooseWhitespaceWithMap(value: string) {
  let normalized = '';
  const rawIndexes: number[] = [];
  let pendingWhitespaceStart: number | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined) continue;
    if (/\s/u.test(character)) {
      if (pendingWhitespaceStart === null) pendingWhitespaceStart = index;
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

function classifyLooseImportedBodyOccurrence(content: string, excerpt: string): ImportedBodyMatch {
  const normalizedContent = normalizeLooseWhitespaceWithMap(content);
  const normalizedExcerpt = normalizeLooseWhitespaceWithMap(excerpt).normalized;
  if (!normalizedContent.normalized || !normalizedExcerpt) return { range: null, status: 'missing' };
  const bodyFrom = resolveImportedBodySearchFrom(content);
  const normalizedFrom = normalizedContent.rawIndexes.findIndex((index) => index >= bodyFrom);
  if (normalizedFrom < 0) return { range: null, status: 'missing' };
  const first = normalizedContent.normalized.indexOf(normalizedExcerpt, normalizedFrom);
  if (first < 0) return { range: null, status: 'missing' };
  if (normalizedContent.normalized.indexOf(normalizedExcerpt, first + 1) >= 0) {
    return { range: null, status: 'ambiguous' };
  }
  const rawStart = normalizedContent.rawIndexes[first];
  const rawEnd = normalizedContent.rawIndexes[first + normalizedExcerpt.length - 1];
  return rawStart === undefined || rawEnd === undefined
    ? { range: null, status: 'missing' }
    : { range: { from: rawStart, to: rawEnd + 1 }, status: 'unique' };
}

export function classifyImportedBodyCandidate(content: string, excerpt: string): ImportedBodyMatch {
  const exact = classifyImportedBodyOccurrence(content, excerpt);
  return exact.status === 'missing' ? classifyLooseImportedBodyOccurrence(content, excerpt) : exact;
}

export function findUniqueAvailableImportedBodyOccurrence(
  content: string,
  excerpt: string,
  occupiedRanges: ImportedBodyRange[]
) {
  const candidate = classifyImportedBodyCandidate(content, excerpt).range;
  if (!candidate) return null;
  const overlaps = occupiedRanges.some((range) => candidate.from < range.to && candidate.to > range.from);
  return overlaps ? null : candidate;
}
