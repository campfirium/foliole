import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT = 100;
export const WORKSPACE_DIVIDER_OPACITY_PERCENT_MIN = 0;
export const WORKSPACE_DIVIDER_OPACITY_PERCENT_MAX = 100;
export const WORKSPACE_DIVIDER_OPACITY_PERCENT_STEP = 1;

export function normalizeWorkspaceDividerOpacityPercent(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return WORKSPACE_DIVIDER_OPACITY_PERCENT_DEFAULT;
  }
  return Math.max(
    WORKSPACE_DIVIDER_OPACITY_PERCENT_MIN,
    Math.min(WORKSPACE_DIVIDER_OPACITY_PERCENT_MAX, Math.round(parsed))
  );
}

export function getWorkspaceDividerOpacityPercent() {
  return normalizeWorkspaceDividerOpacityPercent(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceDividerOpacityPercent)
  );
}

export function setWorkspaceDividerOpacityPercent(value: number) {
  const nextValue = normalizeWorkspaceDividerOpacityPercent(value);
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceDividerOpacityPercent, String(nextValue));
  return nextValue;
}

export function applyWorkspaceDividerOpacityPercent(root: HTMLElement, value: number) {
  root.style.setProperty('--workspace-divider-opacity', String(normalizeWorkspaceDividerOpacityPercent(value) / 100));
}
