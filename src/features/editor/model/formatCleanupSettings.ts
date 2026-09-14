import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import { createDefaultFormatCleanupSettings, DEFAULT_FORMAT_CLEANUP_RULES } from './formatCleanupDefaults';
import type { FormatCleanupRule, FormatCleanupSettings, StoredFormatCleanupSettings } from './formatCleanupTypes';

const STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.formatCleanup;

function isRule(value: unknown): value is FormatCleanupRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rule = value as Partial<FormatCleanupRule>;
  return typeof rule.id === 'string' && typeof rule.enabled === 'boolean' &&
    typeof rule.find === 'string' && typeof rule.follow === 'string' &&
    typeof rule.not === 'string' && typeof rule.replace === 'string' &&
    (rule.scope === 'any' || rule.scope === 'line-start');
}

function readStoredSettings(): StoredFormatCleanupSettings | null {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredFormatCleanupSettings>;
    if (value.version !== 1 || !Array.isArray(value.builtInRules) || !Array.isArray(value.customRules)) return null;
    return {
      builtInRules: value.builtInRules.filter(isRule),
      collapseBlankLines: value.collapseBlankLines !== false,
      customRules: value.customRules.filter(isRule),
      customized: value.customized === true,
      knownBuiltInRuleIds: Array.isArray(value.knownBuiltInRuleIds)
        ? value.knownBuiltInRuleIds.filter((id): id is string => typeof id === 'string')
        : [],
      removeIndentation: value.removeIndentation !== false,
      version: 1
    };
  } catch {
    return null;
  }
}

function mergeCustomizedSettings(stored: StoredFormatCleanupSettings): FormatCleanupSettings {
  const storedById = new Map(stored.builtInRules.map((rule) => [rule.id, rule]));
  const defaultIds = new Set(DEFAULT_FORMAT_CLEANUP_RULES.map((rule) => rule.id));
  const retiredRules = stored.builtInRules.filter((rule) => !defaultIds.has(rule.id));
  return {
    builtInRules: DEFAULT_FORMAT_CLEANUP_RULES.map((rule) => {
      const saved = storedById.get(rule.id);
      if (saved) return saved;
      return stored.knownBuiltInRuleIds.includes(rule.id) ? rule : { ...rule, enabled: false };
    }),
    collapseBlankLines: stored.collapseBlankLines,
    customRules: [...retiredRules, ...stored.customRules],
    customized: true,
    removeIndentation: stored.removeIndentation
  };
}

export function hasSavedFormatCleanupSettings() {
  return readStoredSettings() !== null;
}

export function loadFormatCleanupSettings(): FormatCleanupSettings {
  const stored = readStoredSettings();
  if (!stored || !stored.customized) return createDefaultFormatCleanupSettings();
  return mergeCustomizedSettings(stored);
}

export function saveFormatCleanupSettings(settings: FormatCleanupSettings) {
  const stored: StoredFormatCleanupSettings = {
    ...settings,
    knownBuiltInRuleIds: DEFAULT_FORMAT_CLEANUP_RULES.map((rule) => rule.id),
    version: 1
  };
  setWhitelistedLocalStorageItem(STORAGE_KEY, JSON.stringify(stored));
}
