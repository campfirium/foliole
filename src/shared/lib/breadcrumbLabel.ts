const WIDE_PATTERN = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
const LEADING_SEGMENT_PATTERN = /^(.{2,}?)\s*[:：—|｜]/u;
/** Display budget per level, in half-width units: a CJK glyph counts two, anything else one. */
const WORD_BUDGET = 14;
/** Budget when a single word must be cut mid-way: six CJK glyphs or twelve Latin letters. */
const GLYPH_BUDGET = 12;
const ELLIPSIS = '…';

function charWidth(char: string) {
  return WIDE_PATTERN.test(char) ? 2 : 1;
}

function displayWidth(value: string) {
  let width = 0;
  for (const char of value) width += charWidth(char);
  return width;
}

function fillGlyphs(prefix: string, word: string) {
  let label = prefix;
  for (const char of word) {
    if (displayWidth(label) + charWidth(char) > GLYPH_BUDGET) break;
    label += char;
  }
  return label;
}

function capByWords(title: string) {
  let label = '';
  for (const word of title.split(/\s+/u)) {
    const next = label ? `${label} ${word}` : word;
    if (displayWidth(next) <= WORD_BUDGET) {
      label = next;
      continue;
    }
    // CJK runs carry no spaces, so a wide word is filled glyph by glyph; a Latin word only when nothing fits yet.
    if (!label || WIDE_PATTERN.test(word)) {
      const filled = fillGlyphs(label ? `${label} ` : '', word);
      if (filled.trim().length > label.length) label = filled.trimEnd();
    }
    break;
  }
  return `${label.replace(/[\s:;,.\-–]+$/u, '')}${ELLIPSIS}`;
}

/**
 * Shortens one breadcrumb level to a recognizable label within about fourteen half-width units
 * (a CJK glyph counts two): the whole title when it fits, else a leading segment before a colon or dash,
 * else whole words, filling a CJK run glyph by glyph.
 */
export function capBreadcrumbLabel(title: string) {
  const trimmed = title.trim();
  if (displayWidth(trimmed) <= WORD_BUDGET) return trimmed;
  const leading = LEADING_SEGMENT_PATTERN.exec(trimmed)?.[1];
  if (leading && displayWidth(leading) <= WORD_BUDGET) return `${leading}${ELLIPSIS}`;
  return capByWords(trimmed);
}
