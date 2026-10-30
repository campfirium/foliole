import { READING_LINE_HEIGHT_MIN, READING_LINE_HEIGHT_MAX, READING_LINE_HEIGHT_STEP } from '@/features/settings/model/appearanceSettingsOptions';

export { READING_LINE_HEIGHT_MIN, READING_LINE_HEIGHT_MAX, READING_LINE_HEIGHT_STEP };

export type CompanionReadingFontSize = number | 'small' | 'default' | 'large' | 'xlarge';
export type CompanionReadingLineHeight = number | 'compact' | 'default' | 'relaxed';
export type CompanionReadingFontFamily = 'sans' | 'serif' | `system:${string}` | `custom:${string}`;
export type CompanionReadingContrast = 'default' | 'high';

export interface CompanionReadingTypographySettings {
  contrast: CompanionReadingContrast;
  fontFamily: CompanionReadingFontFamily;
  fontSize: CompanionReadingFontSize;
  lineHeight: CompanionReadingLineHeight;
}

export const DEFAULT_READING_TYPOGRAPHY_SETTINGS: CompanionReadingTypographySettings = {
  contrast: 'default',
  fontFamily: 'sans',
  fontSize: 17,
  lineHeight: 1.62
};

const STORAGE_KEY = 'foliole-companion-reading-typography-settings';

export const READING_FONT_SIZE_MIN = 14;
export const READING_FONT_SIZE_MAX = 80;

const LEGACY_FONT_SIZES: Record<string, number> = { small: 15, default: 17, large: 19, xlarge: 21 };
const LEGACY_LINE_HEIGHTS: Record<string, number> = { compact: 1.45, default: 1.62, relaxed: 1.78 };

export function readingFontSize(value: unknown): number {
  if (typeof value === 'string') return typeof LEGACY_FONT_SIZES[value] === 'number' ? LEGACY_FONT_SIZES[value]! : 17;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(READING_FONT_SIZE_MAX, Math.max(READING_FONT_SIZE_MIN, value))) : 17;
}

export function readingLineHeight(value: unknown): number {
  if (typeof value === 'string') return typeof LEGACY_LINE_HEIGHTS[value] === 'number' ? LEGACY_LINE_HEIGHTS[value]! : 1.62;
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(Math.min(READING_LINE_HEIGHT_MAX, Math.max(READING_LINE_HEIGHT_MIN, value)).toFixed(2)) : 1.62;
}
const FONT_FAMILIES = new Set(['sans', 'serif']);
const CONTRASTS = new Set(['default', 'high']);

function pickEnum<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? value as T : fallback;
}

export function normalizeReadingTypographySettings(value: unknown): CompanionReadingTypographySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_READING_TYPOGRAPHY_SETTINGS;
  }
  const record = value as Record<string, unknown>;
  return {
    contrast: pickEnum(record.contrast, CONTRASTS, DEFAULT_READING_TYPOGRAPHY_SETTINGS.contrast),
    fontFamily: typeof record.fontFamily === 'string' && (
      /^custom:[0-9a-f-]{36}$/.test(record.fontFamily) || /^system:[\p{L}\p{N} ._-]{1,80}$/u.test(record.fontFamily)
    )
      ? record.fontFamily as CompanionReadingFontFamily
      : pickEnum(record.fontFamily, FONT_FAMILIES, DEFAULT_READING_TYPOGRAPHY_SETTINGS.fontFamily),
    fontSize: readingFontSize(record.fontSize),
    lineHeight: readingLineHeight(record.lineHeight)
  };
}

export function loadReadingTypographySettings(storage: Storage = window.localStorage): CompanionReadingTypographySettings {
  try {
    return normalizeReadingTypographySettings(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_READING_TYPOGRAPHY_SETTINGS;
  }
}

export function saveReadingTypographySettings(
  settings: CompanionReadingTypographySettings,
  storage: Storage = window.localStorage
) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeReadingTypographySettings(settings)));
    return true;
  } catch {
    return false;
  }
}
