import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';

export type SettingsCategoryId =
  | 'about'
  | 'backups'
  | 'companion-sync'
  | 'editor'
  | 'external-search'
  | 'mouse-gestures'
  | 'appearance'
  | 'library'
  | 'import'
  | 'readwise-reader'
  | 'review'
  | 'hotkeys';

export const SETTINGS_CATEGORIES: Array<{ description: string; id: SettingsCategoryId; label: string }> = [
  { id: 'about', label: 'General', description: 'View version, diagnostics, and support tools.' },
  { id: 'appearance', label: 'Appearance', description: 'Adjust the look and density of the workspace.' },
  { id: 'editor', label: 'Editor', description: 'Configure editing and writing behavior.' },
  { id: 'review', label: 'Review', description: 'Tune the scheduler and review queue.' },
  { id: 'hotkeys', label: 'Hotkeys', description: 'Customize keyboard shortcuts.' },
  { id: 'mouse-gestures', label: 'Mouse gestures', description: 'Configure mouse gestures and feedback.' },
  { id: 'library', label: 'Library', description: 'Set library, assets, inbox, and mirror folders.' },
  { id: 'companion-sync', label: 'Sync', description: 'Pair other devices and manage local sync.' },
  { id: 'backups', label: 'Backups', description: 'Manage backup location and retention.' },
  { id: 'readwise-reader', label: 'Readwise Reader', description: 'Configure Readwise Reader import.' },
  { id: 'import', label: 'Watched folders', description: 'Configure folders watched for import.' },
  { id: 'external-search', label: 'External sources', description: 'Search and import from external folders.' }
];

export const SETTINGS_CATEGORY_GROUPS: Array<{ categoryIds: SettingsCategoryId[]; label: string }> = [
  {
    label: 'Workspace',
    categoryIds: ['about', 'appearance', 'editor', 'review', 'hotkeys', 'mouse-gestures']
  },
  {
    label: 'Storage',
    categoryIds: ['library', 'companion-sync', 'backups']
  },
  {
    label: 'Connections',
    categoryIds: ['readwise-reader', 'import', 'external-search']
  }
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

export function getSettingsCategoryOption(id: SettingsCategoryId) {
  return SETTINGS_CATEGORIES.find((category) => category.id === id);
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
