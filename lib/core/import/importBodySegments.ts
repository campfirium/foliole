import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../nodes/textBodyBudget.js';

export const IMPORT_BODY_MAX_BYTES = TEXT_BODY_MAX_BYTES;

export interface ImportBodySegment {
  content: string;
  from: number;
  to: number;
}

function characterBytes(character: string) {
  const code = character.codePointAt(0) ?? 0;
  if (code <= 0x7f) return 1;
  if (code <= 0x7ff) return 2;
  return code <= 0xffff ? 3 : 4;
}

function collectSegmentEnd(content: string, from: number, maxBytes: number) {
  let bytes = 0;
  let cursor = from;
  let paragraphEnd = from;
  let lineEnd = from;
  for (const character of content.slice(from)) {
    const nextBytes = bytes + characterBytes(character);
    if (nextBytes > maxBytes) break;
    bytes = nextBytes;
    cursor += character.length;
    if (character !== '\n') continue;
    lineEnd = cursor;
    if (content[cursor] === '\n') paragraphEnd = cursor + 1;
  }
  if (cursor === content.length) return cursor;
  const minimumPreferredEnd = from + Math.floor((cursor - from) / 2);
  if (paragraphEnd >= minimumPreferredEnd && paragraphEnd <= cursor) return paragraphEnd;
  if (lineEnd >= minimumPreferredEnd && lineEnd > from) return lineEnd;
  if (content[cursor - 1] === '\r' && content[cursor] === '\n') return cursor - 1;
  return cursor;
}

/** Split final stored text without trimming, rewriting, or splitting a Unicode code point. */
export function splitImportBody(content: string, maxBytes = IMPORT_BODY_MAX_BYTES,
  protectedRanges: readonly { from: number; to: number }[] = []): ImportBodySegment[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) {
    throw new Error('import_body_byte_budget_invalid');
  }
  if (!content) return [{ content, from: 0, to: 0 }];
  const segments: ImportBodySegment[] = [];
  let from = 0;
  while (from < content.length) {
    let to = collectSegmentEnd(content, from, maxBytes);
    const protectedRange = protectedRanges.find((range) => range.from < to && range.to > to
      && utf8ByteLength(content.slice(range.from, range.to)) <= maxBytes);
    if (protectedRange && protectedRange.from > from) to = protectedRange.from;
    else if (protectedRange && utf8ByteLength(content.slice(from, protectedRange.to)) <= maxBytes) to = protectedRange.to;
    segments.push({ content: content.slice(from, to), from, to });
    from = to;
  }
  return segments;
}
