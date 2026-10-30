import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_READING_TYPOGRAPHY_SETTINGS,
  loadReadingTypographySettings,
  normalizeReadingTypographySettings,
  saveReadingTypographySettings
} from './companionReadingTypographySettings';

describe('companion reading typography settings', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses defaults when local settings are missing or malformed', () => {
    expect(normalizeReadingTypographySettings(null)).toEqual(DEFAULT_READING_TYPOGRAPHY_SETTINGS);
    expect(normalizeReadingTypographySettings({ fontSize: 'huge', lineHeight: 'wide' })).toEqual({
      ...DEFAULT_READING_TYPOGRAPHY_SETTINGS
    });
  });

  it('hydrates known local typography settings', () => {
    window.localStorage.setItem('foliole-companion-reading-typography-settings', JSON.stringify({
      contrast: 'high',
      fontFamily: 'serif',
      fontSize: 'large',
      lineHeight: 'relaxed'
    }));

    expect(loadReadingTypographySettings()).toEqual({
      contrast: 'high',
      fontFamily: 'serif',
      fontSize: 19,
      lineHeight: 1.78
    });
  });

  it('keeps a stored imported font choice across reloads', () => {
    const selected = {
      ...DEFAULT_READING_TYPOGRAPHY_SETTINGS,
      fontFamily: 'custom:12345678-1234-1234-1234-123456789abc' as const
    };
    expect(saveReadingTypographySettings(selected)).toBe(true);
    expect(loadReadingTypographySettings()).toEqual(selected);
  });

  it('keeps a device font choice across reloads', () => {
    const selected = { ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontFamily: 'system:Noto Sans SC' as const };
    expect(saveReadingTypographySettings(selected)).toBe(true);
    expect(loadReadingTypographySettings()).toEqual(selected);
  });

  it('returns false instead of throwing when local persistence fails', () => {
    const storage = {
      setItem: () => {
        throw new Error('blocked');
      }
    } as unknown as Storage;

    expect(saveReadingTypographySettings(DEFAULT_READING_TYPOGRAPHY_SETTINGS, storage)).toBe(false);
  });
});


it('stores intermediate numeric values without rounding them to presets', () => {
  const settings = { ...DEFAULT_READING_TYPOGRAPHY_SETTINGS, fontSize: 18, lineHeight: 1.67 };
  expect(saveReadingTypographySettings(settings)).toBe(true);
  expect(loadReadingTypographySettings()).toEqual(settings);
  window.localStorage.clear();
});

it('bounds numeric inputs and rejects non-finite values', () => {
  expect(normalizeReadingTypographySettings({ fontSize: 100, lineHeight: 3 }))
    .toMatchObject({ fontSize: 80, lineHeight: 2 });
  expect(normalizeReadingTypographySettings({ fontSize: 1, lineHeight: 0 }))
    .toMatchObject({ fontSize: 14, lineHeight: 1.3 });
  expect(normalizeReadingTypographySettings({ fontSize: NaN, lineHeight: Infinity }))
    .toEqual(DEFAULT_READING_TYPOGRAPHY_SETTINGS);
});


it('does not interpret object prototype names as stored sizes', () => {
  expect(normalizeReadingTypographySettings({ fontSize: 'constructor', lineHeight: 'toString' }))
    .toEqual(DEFAULT_READING_TYPOGRAPHY_SETTINGS);
});
