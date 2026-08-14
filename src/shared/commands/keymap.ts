import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../platform/storage';

import { parseShortcutLabel, serializeShortcut } from './shortcuts';
import type { CommandShortcut, CommandShortcutSet } from './types';

interface CommandShortcutOverrideEntry {
  primary?: string;
  secondary?: string;
}

export type CommandShortcutOverrides = Record<string, CommandShortcutOverrideEntry>;

export interface ResolveShortcutMapOptions {
  commandIds: string[];
  defaults: Partial<Record<string, CommandShortcutSet>>;
  overrides: CommandShortcutOverrides;
}

function sanitizeShortcutLabel(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }
  if (!parseShortcutLabel(normalized)) {
    return undefined;
  }
  return normalized;
}

export function parseCommandShortcutOverrides(value: unknown): CommandShortcutOverrides {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = Object.entries(value);
  const sanitized: CommandShortcutOverrides = {};
  for (const [commandId, rawEntry] of entries) {
    if (typeof rawEntry === 'string') {
      const primary = sanitizeShortcutLabel(rawEntry);
      if (primary) {
        sanitized[commandId] = { primary };
      }
      continue;
    }
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }
    const primary = sanitizeShortcutLabel((rawEntry as CommandShortcutOverrideEntry).primary);
    const secondary = sanitizeShortcutLabel((rawEntry as CommandShortcutOverrideEntry).secondary);
    if (primary === undefined && secondary === undefined) {
      continue;
    }
    sanitized[commandId] = {
      ...(primary !== undefined ? { primary } : {}),
      ...(secondary !== undefined ? { secondary } : {})
    };
  }

  return sanitized;
}

export function getCommandShortcutOverrides(): CommandShortcutOverrides {
  try {
    const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return parseCommandShortcutOverrides(parsed);
  } catch {
    return {};
  }
}

export function setCommandShortcutOverrides(overrides: CommandShortcutOverrides) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides, JSON.stringify(overrides));
}

function resolveShortcutSlot(
  overrideEntry: CommandShortcutOverrideEntry | undefined,
  slot: keyof CommandShortcutOverrideEntry,
  fallback: CommandShortcut | undefined
) {
  if (!overrideEntry || !Object.prototype.hasOwnProperty.call(overrideEntry, slot)) {
    return fallback;
  }
  const value = overrideEntry[slot];
  if (!value) {
    return undefined;
  }
  return parseShortcutLabel(value) ?? fallback;
}

export function resolveCommandShortcutMap({ commandIds, defaults, overrides }: ResolveShortcutMapOptions): Record<string, CommandShortcutSet | undefined> {
  const resolved: Record<string, CommandShortcutSet | undefined> = {};

  for (const commandId of commandIds) {
    const overrideEntry = overrides[commandId];
    const defaultEntry = defaults[commandId];
    const primary = resolveShortcutSlot(overrideEntry, 'primary', defaultEntry?.primary);
    const secondary = resolveShortcutSlot(overrideEntry, 'secondary', defaultEntry?.secondary);
    const tertiary = defaultEntry?.tertiary;
    if (primary || secondary || tertiary) {
      resolved[commandId] = {
        ...(primary ? { primary } : {}),
        ...(secondary ? { secondary } : {}),
        ...(tertiary ? { tertiary } : {})
      };
      continue;
    }
    resolved[commandId] = undefined;
  }

  return resolved;
}

export function buildShortcutOverrideLabel(shortcut: CommandShortcut) {
  return serializeShortcut(shortcut);
}
