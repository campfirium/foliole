import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

export const DEFAULT_APP_DISPLAY_SCALE_PERCENT = 100;
export const MIN_APP_DISPLAY_SCALE_PERCENT = 80;
export const MAX_APP_DISPLAY_SCALE_PERCENT = 200;
export const DEFAULT_CONTENT_REGION_SCALE_PERCENT = 100;
export const MIN_CONTENT_REGION_SCALE_PERCENT = 80;
export const MAX_CONTENT_REGION_SCALE_PERCENT = 160;
export const DISPLAY_SCALE_STEP = 10;

export type ContentRegionScaleId =
  | 'folder-navigation'
  | 'topic-navigation'
  | 'folder-content-list'
  | `right-sidebar:${string}`;

export type ContentRegionScales = Partial<Record<ContentRegionScaleId, number>>;

function clampSteppedPercent(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  const stepped = Math.round(value / DISPLAY_SCALE_STEP) * DISPLAY_SCALE_STEP;
  return Math.min(max, Math.max(min, stepped));
}

export function normalizeAppDisplayScalePercent(value: number) {
  return clampSteppedPercent(value, MIN_APP_DISPLAY_SCALE_PERCENT, MAX_APP_DISPLAY_SCALE_PERCENT);
}

export function normalizeContentRegionScalePercent(value: number) {
  return clampSteppedPercent(value, MIN_CONTENT_REGION_SCALE_PERCENT, MAX_CONTENT_REGION_SCALE_PERCENT);
}

export function getAppDisplayScalePercent() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent);
  return raw === null ? DEFAULT_APP_DISPLAY_SCALE_PERCENT : normalizeAppDisplayScalePercent(Number(raw));
}

export function setAppDisplayScalePercent(value: number) {
  const normalized = normalizeAppDisplayScalePercent(value);
  if (normalized === DEFAULT_APP_DISPLAY_SCALE_PERCENT) {
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent);
  } else {
    setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.appDisplayScalePercent, String(normalized));
  }
  return normalized;
}

export function getContentRegionScales(): ContentRegionScales {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.contentRegionScales);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: ContentRegionScales = {};
    for (const [regionId, value] of Object.entries(parsed)) {
      if (typeof value !== 'number') continue;
      const percent = normalizeContentRegionScalePercent(value);
      if (percent !== DEFAULT_CONTENT_REGION_SCALE_PERCENT) {
        normalized[regionId as ContentRegionScaleId] = percent;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

export function setContentRegionScales(value: ContentRegionScales) {
  if (Object.keys(value).length === 0) {
    removeWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.contentRegionScales);
    return;
  }
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.contentRegionScales, JSON.stringify(value));
}
