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
  { id: 'about', label: 'About', description: 'Version details, diagnostics, and workspace support tools.' },
  { id: 'backups', label: 'Backups', description: 'Manage backup location, retention, and recovery tools.' },
  {
    id: 'companion-sync',
    label: 'Sync',
    description: 'Let another device connect to this desktop and manage local sync availability.'
  },
  { id: 'editor', label: 'Editor', description: 'Choose how editing, images, and writing surfaces behave.' },
  { id: 'appearance', label: 'Appearance', description: 'Control the look and density of the workspace.' },
  { id: 'library', label: 'Library', description: 'Point Foliole to your library home, inbox, and mirror paths.' },
  { id: 'import', label: 'Import', description: 'Adjust import sources and intake behavior.' },
  { id: 'mouse-gestures', label: 'Mouse gestures', description: 'Tune gesture actions, thresholds, and trail feedback.' },
  { id: 'readwise-reader', label: 'Readwise Reader', description: 'Configure Readwise Reader folders and parsing rules.' },
  { id: 'review', label: 'Review', description: 'Set scheduler defaults and review queue behavior.' },
  { id: 'hotkeys', label: 'Hotkeys', description: 'Customize keyboard shortcuts for common actions.' },
  {
    id: 'external-search',
    label: 'External library',
    description: 'Search, preview, and import content from your external library.'
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
