import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../platform/storage';

import { parseShortcutLabel, serializeShortcut } from './shortcuts';
import type { CommandShortcut } from './types';

export type CommandShortcutOverrides = Record<string, string>;

export interface ResolveShortcutMapOptions {
  commandIds: string[];
  defaults: Partial<Record<string, CommandShortcut>>;
  overrides: CommandShortcutOverrides;
}

function sanitizeOverrides(value: unknown): CommandShortcutOverrides {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = Object.entries(value);
  const sanitized: CommandShortcutOverrides = {};
  for (const [commandId, label] of entries) {
    if (typeof label !== 'string') {
      continue;
    }
    const normalized = label.trim();
    if (!normalized) {
      continue;
    }
    if (!parseShortcutLabel(normalized)) {
      continue;
    }
    sanitized[commandId] = normalized;
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
    return sanitizeOverrides(parsed);
  } catch {
    return {};
  }
}

export function setCommandShortcutOverrides(overrides: CommandShortcutOverrides) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides, JSON.stringify(overrides));
}

export function resolveCommandShortcutMap({ commandIds, defaults, overrides }: ResolveShortcutMapOptions): Record<string, CommandShortcut | undefined> {
  const resolved: Record<string, CommandShortcut | undefined> = {};

  for (const commandId of commandIds) {
    const overrideLabel = overrides[commandId];
    const overrideShortcut = overrideLabel ? parseShortcutLabel(overrideLabel) : null;
    if (overrideShortcut) {
      resolved[commandId] = overrideShortcut;
      continue;
    }
    resolved[commandId] = defaults[commandId];
  }

  return resolved;
}

export function buildShortcutOverrideLabel(shortcut: CommandShortcut) {
  return serializeShortcut(shortcut);
}
