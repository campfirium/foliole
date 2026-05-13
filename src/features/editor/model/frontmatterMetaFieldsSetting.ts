import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_PERSISTED_APP_SETTINGS
} from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const FRONTMATTER_META_FIELDS_KEY = APP_SETTINGS_STORAGE_KEYS.frontmatterMetaFields;
export const FRONTMATTER_META_FIELDS_DEFAULT = DEFAULT_PERSISTED_APP_SETTINGS.frontmatterMetaFields;

export function parseFrontmatterMetaFieldGroups(value: string): string[][] {
  return value
    .split(',')
    .map((group) => group
      .split('|')
      .map((field) => field.trim())
      .filter(Boolean))
    .filter((group) => group.length > 0);
}

export function getFrontmatterMetaFields(): string {
  return getWhitelistedLocalStorageItem(FRONTMATTER_META_FIELDS_KEY) ?? FRONTMATTER_META_FIELDS_DEFAULT;
}

export function setFrontmatterMetaFields(value: string) {
  setWhitelistedLocalStorageItem(FRONTMATTER_META_FIELDS_KEY, value);
  return value;
}

export function resetFrontmatterMetaFields() {
  return setFrontmatterMetaFields(FRONTMATTER_META_FIELDS_DEFAULT);
}
