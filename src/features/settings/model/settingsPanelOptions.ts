import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';

export type SettingsCategoryId =
  | 'about'
  | 'backups'
  | 'editor'
  | 'mouse-gestures'
  | 'appearance'
  | 'library'
  | 'import'
  | 'readwise-reader'
  | 'review'
  | 'hotkeys';

export const SETTINGS_CATEGORIES: Array<{ id: SettingsCategoryId; label: string }> = [
  { id: 'about', label: 'About' },
  { id: 'backups', label: 'Backups' },
  { id: 'editor', label: 'Editor' },
  { id: 'mouse-gestures', label: 'Mouse gestures' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'library', label: 'Library' },
  { id: 'import', label: 'Import' },
  { id: 'readwise-reader', label: 'Readwise Reader' },
  { id: 'review', label: 'Review' },
  { id: 'hotkeys', label: 'Hotkeys' }
];

export const SETTINGS_CATEGORY_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory;

export const INTERFACE_PRESET_OPTION_VALUES: InterfaceFontPreset[] = [
  'default',
  'inter',
  'system',
  'source-sans',
  'serif',
  'rounded'
];

export const MONOSPACE_PRESET_OPTION_VALUES: MonospaceFontPreset[] = [
  'default',
  'jetbrains',
  'cascadia',
  'consolas',
  'fira',
  'sarasa'
];

export function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return SETTINGS_CATEGORIES.some((category) => category.id === value);
}

export function getInitialSettingsCategory(): SettingsCategoryId {
  const raw = getWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY);
  return raw && isSettingsCategoryId(raw) ? raw : 'editor';
}

export function presetLabel(preset: InterfaceFontPreset) {
  switch (preset) {
    case 'default':
      return 'Default';
    case 'inter':
      return 'Inter';
    case 'system':
      return 'System UI';
    case 'source-sans':
      return 'Source Sans';
    case 'serif':
      return 'Serif';
    case 'rounded':
      return 'Rounded';
    default:
      return 'Custom';
  }
}

export function monospacePresetLabel(preset: MonospaceFontPreset) {
  switch (preset) {
    case 'default':
      return 'Default';
    case 'jetbrains':
      return 'JetBrains Mono';
    case 'cascadia':
      return 'Cascadia Code';
    case 'consolas':
      return 'Consolas';
    case 'fira':
      return 'Fira Code';
    case 'sarasa':
      return 'Sarasa Mono';
    default:
      return 'Custom';
  }
}
