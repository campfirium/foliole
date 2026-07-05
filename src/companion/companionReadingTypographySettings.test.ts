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
      fontSize: 'large',
      lineHeight: 'relaxed'
    });
  });

  it('returns false instead of throwing when local persistence fails', () => {
    const storage = {
      setItem: () => {
        throw new Error('blocked');
      }
    } as Storage;

    expect(saveReadingTypographySettings(DEFAULT_READING_TYPOGRAPHY_SETTINGS, storage)).toBe(false);
  });
});
