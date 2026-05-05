const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)(?:\s+id="[^"]+")?\s*>/g;
const CLOZE_PLACEHOLDER_PATTERN = /\s*\[\.\.\.\]\s*/g;
const CLOZE_PLACEHOLDER_VARIANT_PATTERN = /\s*[[［【]\s*(?:\.{3,}|…+|⋯+)\s*[\]］】]\s*/g;

export function stripAnchorTags(value: string) {
  return value.replace(ANCHOR_TAG_PATTERN, '');
}

export function normalizeComparableText(value: string | null | undefined) {
  return stripAnchorTags(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeClozeComparableText(value: string | null | undefined) {
  return normalizeComparableText(value)
    .replace(CLOZE_PLACEHOLDER_VARIANT_PATTERN, '[...]')
    .replace(CLOZE_PLACEHOLDER_PATTERN, '[...]');
}

export function compactNoteText(value: string | null | undefined) {
  return stripAnchorTags(value ?? '')
    .replace(/\r\n?/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function preserveNoteLines(value: string | null | undefined) {
  return stripAnchorTags(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
}
