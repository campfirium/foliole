import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

export interface MaterialHistoryView {
  first: 'preview' | 'breadcrumb';
  lines: 1 | 2 | 3;
}

const key = APP_SETTINGS_STORAGE_KEYS.materialHistoryView;
const defaultView: MaterialHistoryView = { first: 'preview', lines: 2 };

export function loadMaterialHistoryView(): MaterialHistoryView {
  try {
    const value = JSON.parse(getWhitelistedLocalStorageItem(key) ?? 'null');
    return {
      first: value?.first === 'breadcrumb' ? 'breadcrumb' : defaultView.first,
      lines: value?.lines === 1 || value?.lines === 3 ? value.lines : defaultView.lines
    };
  } catch {
    return defaultView;
  }
}

export function saveMaterialHistoryView(view: MaterialHistoryView) {
  setWhitelistedLocalStorageItem(key, JSON.stringify(view));
}
