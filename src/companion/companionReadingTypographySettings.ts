export type CompanionReadingFontSize = 'small' | 'default' | 'large' | 'xlarge';
export type CompanionReadingLineHeight = 'compact' | 'default' | 'relaxed';
export type CompanionReadingFontFamily = 'sans' | 'serif';
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
  fontSize: 'default',
  lineHeight: 'default'
};

const STORAGE_KEY = 'foliole-companion-reading-typography-settings';

const FONT_SIZES = new Set(['small', 'default', 'large', 'xlarge']);
const LINE_HEIGHTS = new Set(['compact', 'default', 'relaxed']);
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
    fontFamily: pickEnum(record.fontFamily, FONT_FAMILIES, DEFAULT_READING_TYPOGRAPHY_SETTINGS.fontFamily),
    fontSize: pickEnum(record.fontSize, FONT_SIZES, DEFAULT_READING_TYPOGRAPHY_SETTINGS.fontSize),
    lineHeight: pickEnum(record.lineHeight, LINE_HEIGHTS, DEFAULT_READING_TYPOGRAPHY_SETTINGS.lineHeight)
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
