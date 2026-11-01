export const READING_FONT_WEIGHT_DEFAULT = 400;
export const READING_FONT_WEIGHT_MIN = 300;
export const READING_FONT_WEIGHT_MAX = 550;
export const READING_FONT_WEIGHT_STEP = 10;

export function normalizeReadingFontWeight(value: unknown) {
  if (value === null || value === '') return READING_FONT_WEIGHT_DEFAULT;
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(Math.min(READING_FONT_WEIGHT_MAX, Math.max(READING_FONT_WEIGHT_MIN, numeric)))
    : READING_FONT_WEIGHT_DEFAULT;
}
