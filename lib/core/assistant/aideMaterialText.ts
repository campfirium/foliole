export const AIDE_READ_SEGMENT_DEFAULT = 4_000;
export const AIDE_READ_SEGMENT_MAX = 16_000;
export const AIDE_SEARCH_MATCH_DEFAULT = 10;
export const AIDE_SEARCH_MATCH_MAX = 30;
const EXCERPT_RADIUS = 120;

export interface AideTextSegment {
  content: string;
  content_char_count: number;
  content_end: number;
  content_offset: number;
  content_truncated: boolean;
}

export interface AideTextMatch {
  excerpt: string;
  from: number;
  to: number;
}

// Offsets are character positions in the stored Markdown, the same ones read_material accepts.
export function sliceAideMaterialText(content: string, offset = 0, length = AIDE_READ_SEGMENT_DEFAULT): AideTextSegment {
  const start = Math.min(Math.max(0, offset), content.length);
  const end = Math.min(content.length, start + Math.min(Math.max(1, length), AIDE_READ_SEGMENT_MAX));
  return {
    content: content.slice(start, end),
    content_char_count: content.length,
    content_end: end,
    content_offset: start,
    content_truncated: end < content.length
  };
}

export function searchAideMaterialText(content: string, query: string, limit = AIDE_SEARCH_MATCH_DEFAULT) {
  const needle = query.trim().toLocaleLowerCase();
  const max = Math.min(Math.max(1, limit), AIDE_SEARCH_MATCH_MAX);
  const matches: AideTextMatch[] = [];
  let total = 0;
  if (!needle) return { matches, total };
  const haystack = content.toLocaleLowerCase();
  // Lower-casing can change length for a few scripts; fall back to exact matching then.
  const comparable = haystack.length === content.length ? haystack : content;
  const target = haystack.length === content.length ? needle : query.trim();
  for (let from = comparable.indexOf(target); from >= 0; from = comparable.indexOf(target, from + target.length)) {
    total += 1;
    if (matches.length < max) matches.push({ excerpt: excerptAround(content, from, from + target.length), from, to: from + target.length });
  }
  return { matches, total };
}

function excerptAround(content: string, from: number, to: number) {
  const start = Math.max(0, from - EXCERPT_RADIUS);
  const end = Math.min(content.length, to + EXCERPT_RADIUS);
  const text = content.slice(start, end).replace(/\s+/gu, ' ').trim();
  return `${start > 0 ? '…' : ''}${text}${end < content.length ? '…' : ''}`;
}
