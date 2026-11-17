import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

export interface MaterialHistoryView {
  first: 'preview' | 'breadcrumb';
  lines: 1 | 2 | 3;
  fontSize: number;
}

const key = APP_SETTINGS_STORAGE_KEYS.materialHistoryView;
export const HISTORY_FONT_SIZE_MIN = 10;
export const HISTORY_FONT_SIZE_MAX = 24;
const defaultView: MaterialHistoryView = { first: 'preview', lines: 2, fontSize: 15 };

function loadFontSize(value: unknown) {
  if (value === 'small') return 13;
  if (value === 'large') return 17;
  if (typeof value !== 'number' || !Number.isFinite(value)) return defaultView.fontSize;
  return Math.max(HISTORY_FONT_SIZE_MIN, Math.min(HISTORY_FONT_SIZE_MAX, Math.round(value)));
}

export function loadMaterialHistoryView(): MaterialHistoryView {
  try {
    const value = JSON.parse(getWhitelistedLocalStorageItem(key) ?? 'null');
    return {
      first: value?.first === 'breadcrumb' ? 'breadcrumb' : defaultView.first,
      lines: value?.lines === 1 || value?.lines === 3 ? value.lines : defaultView.lines,
      fontSize: loadFontSize(value?.fontSize)
    };
  } catch {
    return defaultView;
  }
}

export function saveMaterialHistoryView(view: MaterialHistoryView) {
  setWhitelistedLocalStorageItem(key, JSON.stringify(view));
}
