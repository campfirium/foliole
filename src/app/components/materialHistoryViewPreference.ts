import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

import { normalizePanelViewFontSize, PANEL_FONT_SIZE_DEFAULT } from './panelViewFontSize';

export interface MaterialHistoryView {
  first: 'preview' | 'breadcrumb';
  lines: 1 | 2 | 3;
  previewSize: number;
  breadcrumbSize: number;
}

const key = APP_SETTINGS_STORAGE_KEYS.materialHistoryView;
const defaultView: MaterialHistoryView = { first: 'preview', lines: 2, previewSize: PANEL_FONT_SIZE_DEFAULT, breadcrumbSize: 12 };

function loadLegacyFontSize(value: unknown) {
  if (value === 'small') return 13;
  if (value === 'large') return 17;
  return normalizePanelViewFontSize(value);
}

export function loadMaterialHistoryView(): MaterialHistoryView {
  try {
    const value = JSON.parse(getWhitelistedLocalStorageItem(key) ?? 'null');
    const first = value?.first === 'breadcrumb' ? 'breadcrumb' : defaultView.first;
    const legacyPreview = loadLegacyFontSize(value?.fontSize);
    const legacyBreadcrumb = first === 'breadcrumb'
      ? legacyPreview + 2
      : Math.round(defaultView.breadcrumbSize + (legacyPreview - defaultView.previewSize) * 0.75);
    return {
      first,
      lines: value?.lines === 1 || value?.lines === 3 ? value.lines : defaultView.lines,
      previewSize: normalizePanelViewFontSize(value?.previewSize ?? legacyPreview),
      breadcrumbSize: normalizePanelViewFontSize(value?.breadcrumbSize ?? legacyBreadcrumb)
    };
  } catch {
    return defaultView;
  }
}

export function saveMaterialHistoryView(view: MaterialHistoryView) {
  setWhitelistedLocalStorageItem(key, JSON.stringify(view));
}
