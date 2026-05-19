import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export interface SelectionToolbarSettings {
  enabled: boolean;
  opacityPercent: number;
}

export const DEFAULT_SELECTION_TOOLBAR_SETTINGS: SelectionToolbarSettings = {
  enabled: true,
  opacityPercent: 100
};

const STORAGE_KEYS = {
  enabled: APP_SETTINGS_STORAGE_KEYS.selectionToolbarEnabled,
  opacityPercent: APP_SETTINGS_STORAGE_KEYS.selectionToolbarOpacityPercent
} as const;

export function normalizeSelectionToolbarOpacityPercent(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_SELECTION_TOOLBAR_SETTINGS.opacityPercent;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SELECTION_TOOLBAR_SETTINGS.opacityPercent;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function getSelectionToolbarEnabled() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEYS.enabled);
  return raw === null ? DEFAULT_SELECTION_TOOLBAR_SETTINGS.enabled : raw === 'true';
}

export function setSelectionToolbarEnabled(value: boolean) {
  setWhitelistedLocalStorageItem(STORAGE_KEYS.enabled, String(value));
}

export function getSelectionToolbarOpacityPercent() {
  return normalizeSelectionToolbarOpacityPercent(
    getWhitelistedLocalStorageItem(STORAGE_KEYS.opacityPercent)
  );
}

export function setSelectionToolbarOpacityPercent(value: number) {
  const nextValue = normalizeSelectionToolbarOpacityPercent(value);
  setWhitelistedLocalStorageItem(STORAGE_KEYS.opacityPercent, String(nextValue));
  return nextValue;
}

export function applySelectionToolbarOpacityPercent(value: number) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.style.setProperty(
    '--app-selection-toolbar-opacity',
    String(normalizeSelectionToolbarOpacityPercent(value) / 100)
  );
}
