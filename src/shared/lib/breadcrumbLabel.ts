const CJK_PATTERN = /[぀-ヿ㐀-鿿가-힯]/u;
const LEADING_SEGMENT_PATTERN = /^(.{2,}?)\s*[:：—|｜]/u;
const CJK_LIMIT = 6;
const LATIN_LIMIT = 14;
const ELLIPSIS = '…';

function glyphLength(value: string) {
  return Array.from(value).length;
}

function capLatin(title: string) {
  let label = '';
  for (const word of title.split(/\s+/u)) {
    const next = label ? `${label} ${word}` : word;
    if (glyphLength(next) > LATIN_LIMIT) break;
    label = next;
  }
  if (!label) label = Array.from(title).slice(0, LATIN_LIMIT - 2).join('');
  return `${label.replace(/[:;,.\-–]+$/u, '')}${ELLIPSIS}`;
}

/** Shortens one breadcrumb level to a recognizable label: a leading segment before a colon or dash, else six CJK glyphs or about fourteen Latin letters cut at a word. */
export function capBreadcrumbLabel(title: string) {
  const trimmed = title.trim();
  const isCjk = CJK_PATTERN.test(trimmed);
  const limit = isCjk ? CJK_LIMIT : LATIN_LIMIT;
  const leading = LEADING_SEGMENT_PATTERN.exec(trimmed)?.[1];
  if (leading && glyphLength(leading) <= limit) return `${leading}${ELLIPSIS}`;
  if (glyphLength(trimmed) <= limit) return trimmed;
  return isCjk ? `${Array.from(trimmed).slice(0, CJK_LIMIT).join('')}${ELLIPSIS}` : capLatin(trimmed);
}
