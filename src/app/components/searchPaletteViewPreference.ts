import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

export interface SearchPaletteView {
  lines: 1 | 2 | 3;
  showTimestamp: boolean;
}

const key = APP_SETTINGS_STORAGE_KEYS.searchPaletteView;
const defaultView: SearchPaletteView = { lines: 2, showTimestamp: true };

function loadSearchPaletteView(): SearchPaletteView {
  try {
    const value = JSON.parse(getWhitelistedLocalStorageItem(key) ?? 'null');
    return {
      lines: value?.lines === 1 || value?.lines === 3 ? value.lines : defaultView.lines,
      showTimestamp: value?.showTimestamp !== false
    };
  } catch {
    return defaultView;
  }
}

export function useSearchPaletteView() {
  const [view, setView] = useState(loadSearchPaletteView);
  function updateView(next: SearchPaletteView) {
    setView(next);
    setWhitelistedLocalStorageItem(key, JSON.stringify(next));
  }
  return [view, updateView] as const;
}
