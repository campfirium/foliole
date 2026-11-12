import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { isFeaturePreviewVisible } from '../../../shared/config/featurePreviews';
import type { TranslationKey } from '../../../shared/localization/translations';
import { isDesktopRuntime } from '../../../shared/platform/runtime';
import { resolveRuntimeOperatingSystem } from '../../../shared/platform/runtime/operatingSystem';
import { getWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

import type { InterfaceFontPreset, MonospaceFontPreset } from './appearanceSettings';

export type SettingsCategoryId =
  | 'about'
  | 'backups'
  | 'companion-sync'
  | 'webdav-sync'
  | 'editor'
  | 'external-search'
  | 'general'
  | 'mouse-gestures'
  | 'publishing'
  | 'rail'
  | 'document-menu'
  | 'web-lookup'
  | 'appearance'
  | 'typography'
  | 'library'
  | 'import'
  | 'readwise-reader'
  | 'review'
  | 'reminders'
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
  { id: 'typography', labelKey: 'settings.category.typography.label', descriptionKey: 'settings.category.typography.description' },
  { id: 'editor', labelKey: 'settings.category.editor.label', descriptionKey: 'settings.category.editor.description' },
  { id: 'web-lookup', labelKey: 'settings.category.webLookup.label', descriptionKey: 'settings.category.webLookup.description' },
  { id: 'reminders', labelKey: 'settings.reminders.title', descriptionKey: 'settings.reminders.thisDevice' },
  { id: 'review', labelKey: 'settings.category.review.label', descriptionKey: 'settings.category.review.description' },
  { id: 'publishing', labelKey: 'settings.category.publishing.label', descriptionKey: 'settings.category.publishing.description' },
  { id: 'rail', labelKey: 'settings.category.rail.label', descriptionKey: 'settings.category.rail.description' },
  { id: 'document-menu', labelKey: 'settings.category.documentMenu.label', descriptionKey: 'settings.category.documentMenu.description' },
  { id: 'hotkeys', labelKey: 'settings.category.hotkeys.label', descriptionKey: 'settings.category.hotkeys.description' },
  { id: 'mouse-gestures', labelKey: 'settings.category.mouseGestures.label', descriptionKey: 'settings.category.mouseGestures.description' },
  { id: 'library', labelKey: 'settings.category.library.label', descriptionKey: 'settings.category.library.description' },
  { id: 'companion-sync', labelKey: 'settings.category.companionSync.label', descriptionKey: 'settings.category.companionSync.description' },
  { id: 'webdav-sync', labelKey: 'settings.companionSync.webdav.category', descriptionKey: 'settings.companionSync.webdav.description' },
  { id: 'backups', labelKey: 'settings.category.backups.label', descriptionKey: 'settings.category.backups.description' },
  { id: 'import', labelKey: 'settings.category.import.label', descriptionKey: 'settings.category.import.description' },
  { id: 'external-search', labelKey: 'settings.category.externalSearch.label', descriptionKey: 'settings.category.externalSearch.description' },
  { id: 'readwise-reader', labelKey: 'settings.category.readwiseReader.label', descriptionKey: 'settings.category.readwiseReader.description' }
];

export type SettingsCategoryOption = { description: string; id: SettingsCategoryId; label: string };

export function getSettingsCategories(t: Translate): SettingsCategoryOption[] {
  return SETTINGS_CATEGORY_DEFINITIONS.filter(category => isVisibleCategory(category.id)).map((category) => ({
    description: t(category.descriptionKey),
    id: category.id,
    label: t(category.id === 'companion-sync' && isVisibleCategory('webdav-sync')
      ? 'settings.companionSync.webdav.lanCategory' : category.labelKey)
  }));
}

const SETTINGS_CATEGORY_GROUP_DEFINITIONS: Array<{ categoryIds: SettingsCategoryId[]; labelKey: TranslationKey }> = [
  {
    labelKey: 'settings.group.workspace',
    categoryIds: ['general', 'appearance', 'typography', 'editor', 'review', 'reminders', 'publishing']
  },
  {
    labelKey: 'settings.group.controls',
    categoryIds: ['hotkeys', 'rail', 'document-menu', 'mouse-gestures', 'web-lookup']
  },
  {
    labelKey: 'settings.group.storage',
    categoryIds: ['library', 'companion-sync', 'webdav-sync', 'backups']
  },
  {
    labelKey: 'settings.group.sources',
    categoryIds: ['import', 'external-search', 'readwise-reader']
  }
];

export function getSettingsCategoryGroups(t: Translate) {
  return SETTINGS_CATEGORY_GROUP_DEFINITIONS.map((group) => ({
    categoryIds: group.categoryIds.filter(isVisibleCategory),
    label: t(group.labelKey)
  }));
}

export const SETTINGS_CATEGORY_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory;

export const INTERFACE_PRESET_OPTION_VALUES: InterfaceFontPreset[] = [
  'default'
];

export const MONOSPACE_PRESET_OPTION_VALUES: MonospaceFontPreset[] = [
  'default',
  'jetbrains',
  'cascadia',
  'consolas',
  'fira',
  'sarasa'
];

export function isDesktopWebDavSettingsVisible() {
  return isDesktopRuntime() && resolveRuntimeOperatingSystem() === 'macos'
    && isFeaturePreviewVisible('webdavSyncSettings');
}

function isVisibleCategory(id: SettingsCategoryId) {
  return id !== 'webdav-sync' || isDesktopWebDavSettingsVisible();
}

function isSettingsCategoryId(value: string): value is SettingsCategoryId {
  return SETTINGS_CATEGORY_DEFINITIONS.some((category) => category.id === value && isVisibleCategory(category.id));
}

export function getSettingsCategoryOption(id: SettingsCategoryId, t: Translate) {
  return getSettingsCategories(t).find((category) => category.id === id);
}

export function getInitialSettingsCategory(): SettingsCategoryId {
  const raw = getWhitelistedLocalStorageItem(SETTINGS_CATEGORY_STORAGE_KEY);
  if (raw === 'models') return 'general';
  return raw && isSettingsCategoryId(raw) ? raw : 'editor';
}

export function presetLabel(preset: InterfaceFontPreset, t?: Translate) {
  switch (preset) {
    case 'default':
    case 'system':
      return t ? t('settings.appearance.fontPreset.default') : 'Default';
    case 'serif':
      return t ? t('settings.appearance.fontPreset.serif') : 'Serif';
    case 'noto-sans-sc':
      return 'Noto Sans SC';
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
