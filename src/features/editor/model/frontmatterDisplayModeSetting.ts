import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_PERSISTED_APP_SETTINGS,
  type FrontmatterDisplayMode
} from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export type { FrontmatterDisplayMode } from '../../../shared/config/appSettings';

const FRONTMATTER_DISPLAY_MODE_KEY = APP_SETTINGS_STORAGE_KEYS.frontmatterDisplayMode;
const FRONTMATTER_DISPLAY_MODE_DEFAULT: FrontmatterDisplayMode =
  DEFAULT_PERSISTED_APP_SETTINGS.frontmatterDisplayMode;

function isFrontmatterDisplayMode(value: string): value is FrontmatterDisplayMode {
  return value === 'compact' || value === 'full';
}

export function getFrontmatterDisplayMode(): FrontmatterDisplayMode {
  const raw = getWhitelistedLocalStorageItem(FRONTMATTER_DISPLAY_MODE_KEY);
  if (!raw || !isFrontmatterDisplayMode(raw)) {
    return FRONTMATTER_DISPLAY_MODE_DEFAULT;
  }
  return raw;
}

export function setFrontmatterDisplayMode(value: FrontmatterDisplayMode) {
  setWhitelistedLocalStorageItem(FRONTMATTER_DISPLAY_MODE_KEY, value);
}
