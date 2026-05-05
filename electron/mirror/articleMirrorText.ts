import { stripAnchorBlocks } from '../../src/features/editor/model/anchorBlocks.js';

const CLOZE_PLACEHOLDER_PATTERN = /\s*\[\.\.\.\]\s*/g;
const CLOZE_PLACEHOLDER_VARIANT_PATTERN = /\s*[[［【]\s*(?:\.{3,}|…+|⋯+)\s*[\]］】]\s*/g;

export function stripAnchorTags(value: string) {
  return stripAnchorBlocks(value);
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
