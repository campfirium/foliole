import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import type { TranslationKey } from '../../../shared/localization/translations';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';

export type SettingsCategoryId =
  | 'about'
  | 'backups'
  | 'companion-sync'
  | 'editor'
  | 'external-search'
  | 'general'
  | 'mouse-gestures'
  | 'publishing'
  | 'rail'
  | 'web-lookup'
  | 'appearance'
  | 'library'
  | 'import'
  | 'readwise-reader'
  | 'review'
  | 'hotkeys';

type Translate = (key: TranslationKey) => string;

const SETTINGS_CATEGORY_DEFINITIONS: Array<{
  descriptionKey: TranslationKey;
  id: SettingsCategoryId;
  labelKey: TranslationKey;
}> = [
  { id: 'about', labelKey: 'settings.category.about.label', descriptionKey: 'settings.category.about.description' },
  { id: 'general', labelKey: 'settings.category.general.label', descriptionKey: 'settings.category.general.description' },
  { id: 'appearance', labelKey: 'settings.category.appearance.label', descriptionKey: 'settings.category.appearance.description' },
  { id: 'editor', labelKey: 'settings.category.editor.label', descriptionKey: 'settings.category.editor.description' },
  { id: 'web-lookup', labelKey: 'settings.category.webLookup.label', descriptionKey: 'settings.category.webLookup.description' },
  { id: 'review', labelKey: 'settings.category.review.label', descriptionKey: 'settings.category.review.description' },
  { id: 'publishing', labelKey: 'settings.category.publishing.label', descriptionKey: 'settings.category.publishing.description' },
  { id: 'rail', labelKey: 'settings.category.rail.label', descriptionKey: 'settings.category.rail.description' },
  { id: 'hotkeys', labelKey: 'settings.category.hotkeys.label', descriptionKey: 'settings.category.hotkeys.description' },
  { id: 'mouse-gestures', labelKey: 'settings.category.mouseGestures.label', descriptionKey: 'settings.category.mouseGestures.description' },
  { id: 'library', labelKey: 'settings.category.library.label', descriptionKey: 'settings.category.library.description' },
  { id: 'companion-sync', labelKey: 'settings.category.companionSync.label', descriptionKey: 'settings.category.companionSync.description' },
  { id: 'backups', labelKey: 'settings.category.backups.label', descriptionKey: 'settings.category.backups.description' },
  { id: 'import', labelKey: 'settings.category.import.label', descriptionKey: 'settings.category.import.description' },
  { id: 'external-search', labelKey: 'settings.category.externalSearch.label', descriptionKey: 'settings.category.externalSearch.description' },
  { id: 'readwise-reader', labelKey: 'settings.category.readwiseReader.label', descriptionKey: 'settings.category.readwiseReader.description' }
];

export type SettingsCategoryOption = { description: string; id: SettingsCategoryId; label: string };

export function getSettingsCategories(t: Translate): SettingsCategoryOption[] {
  return SETTINGS_CATEGORY_DEFINITIONS.map((category) => ({
    description: t(category.descriptionKey),
    id: category.id,
    label: t(category.labelKey)
  }));
}

const SETTINGS_CATEGORY_GROUP_DEFINITIONS: Array<{ categoryIds: SettingsCategoryId[]; labelKey: TranslationKey }> = [
  {
    labelKey: 'settings.group.workspace',
    categoryIds: ['about', 'general', 'appearance', 'editor', 'review', 'publishing']
  },
  {
    labelKey: 'settings.group.controls',
    categoryIds: ['hotkeys', 'rail', 'mouse-gestures', 'web-lookup']
  },
  {
    labelKey: 'settings.group.storage',
    categoryIds: ['library', 'companion-sync', 'backups']
  },
  {
    labelKey: 'settings.group.sources',
    categoryIds: ['import', 'external-search', 'readwise-reader']
  }
];

export function getSettingsCategoryGroups(t: Translate) {
  return SETTINGS_CATEGORY_GROUP_DEFINITIONS.map((group) => ({
    categoryIds: group.categoryIds,
    label: t(group.labelKey)
  }));
}

export const SETTINGS_CATEGORY_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory;

export const INTERFACE_PRESET_OPTION_VALUES: InterfaceFontPreset[] = [
  'default',
  'system',
  'serif'
];

export const MONOSPACE_PRESET_OPTION_VALUES: MonospaceFontPreset[] = [
  'default',
  'jetbrains',
  'cascadia',
  'consolas',
  'fira',
  'sarasa'
];

function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return SETTINGS_CATEGORY_DEFINITIONS.some((category) => category.id === value);
}

export function getSettingsCategoryOption(id: SettingsCategoryId, t: Translate) {
  return getSettingsCategories(t).find((category) => category.id === id);
}

export function getInitialSettingsCategory(): SettingsCategoryId {
  const raw = getWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY);
  return raw && isSettingsCategoryId(raw) ? raw : 'editor';
}

export function presetLabel(preset: InterfaceFontPreset, t?: Translate) {
  switch (preset) {
    case 'default':
      return t ? t('settings.appearance.fontPreset.default') : 'Default';
    case 'system':
      return t ? t('settings.appearance.fontPreset.system') : 'System UI';
    case 'serif':
      return t ? t('settings.appearance.fontPreset.serif') : 'Serif';
    default:
      return t ? t('settings.appearance.fontPreset.custom') : 'Custom';
  }
}

export function monospacePresetLabel(preset: MonospaceFontPreset, t?: Translate) {
  switch (preset) {
    case 'default':
      return t ? t('settings.appearance.fontPreset.default') : 'Default';
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
      return t ? t('settings.appearance.fontPreset.custom') : 'Custom';
  }
}
