import { beforeEach, describe, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { DEFAULT_FORMAT_CLEANUP_RULES } from './formatCleanupDefaults';
import { loadFormatCleanupSettings, saveFormatCleanupSettings } from './formatCleanupSettings';

describe('format cleanup settings', () => {
  beforeEach(() => window.localStorage.clear());

  it('tracks current defaults until the profile is customized', () => {
    saveFormatCleanupSettings({
      builtInRules: [],
      collapseBlankLines: false,
      customRules: [],
      customized: false,
      removeIndentation: false
    });

    const loaded = loadFormatCleanupSettings();
    expect(loaded.customized).toBe(false);
    expect(loaded.builtInRules).toEqual(DEFAULT_FORMAT_CLEANUP_RULES);
    expect(loaded.removeIndentation).toBe(true);
  });

  it('keeps edits and disables built-in rules added after customization', () => {
    const savedRule = { ...DEFAULT_FORMAT_CLEANUP_RULES[0]!, enabled: false, replace: '—' };
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.formatCleanup, JSON.stringify({
      builtInRules: [savedRule],
      collapseBlankLines: false,
      customRules: [],
      customized: true,
      knownBuiltInRuleIds: [savedRule.id],
      removeIndentation: false,
      version: 1
    }));

    const loaded = loadFormatCleanupSettings();
    expect(loaded.builtInRules[0]).toEqual(savedRule);
    expect(loaded.builtInRules.slice(1).every((rule) => !rule.enabled)).toBe(true);
    expect(loaded.collapseBlankLines).toBe(false);
  });
});
