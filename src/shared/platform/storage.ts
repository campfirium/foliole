import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { saveRuntimeAppSettingsState } from './appSettingsState';

const LOCAL_STORAGE_WHITELIST = new Set<string>([
  APP_SETTINGS_STORAGE_KEYS.editorDisplayMode,
  APP_SETTINGS_STORAGE_KEYS.markdownSyntaxVisibility,
  APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory,
  APP_SETTINGS_STORAGE_KEYS.uiFont,
  APP_SETTINGS_STORAGE_KEYS.customUiFont,
  APP_SETTINGS_STORAGE_KEYS.interfaceFont,
  APP_SETTINGS_STORAGE_KEYS.monospaceFont,
  APP_SETTINGS_STORAGE_KEYS.baseColor,
  APP_SETTINGS_STORAGE_KEYS.accentColor,
  APP_SETTINGS_STORAGE_KEYS.interfaceFontSize,
  APP_SETTINGS_STORAGE_KEYS.customInterfaceFont,
  APP_SETTINGS_STORAGE_KEYS.customMonospaceFont,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftAction,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureRightAction,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftUpAction,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureLeftDownAction,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailColor,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailLineWidth,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailOpacity,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureSegmentThreshold,
  APP_SETTINGS_STORAGE_KEYS.mouseGestureTrailPointThreshold,
  APP_SETTINGS_STORAGE_KEYS.nodeIconPendingStrokeStyle,
  APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledStrokeStyle,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedStrokeStyle,
  APP_SETTINGS_STORAGE_KEYS.nodeIconPendingDashLength,
  APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledDashLength,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedDashLength,
  APP_SETTINGS_STORAGE_KEYS.nodeIconPendingGapLength,
  APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledGapLength,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedGapLength,
  APP_SETTINGS_STORAGE_KEYS.nodeIconPendingLineWidth,
  APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledLineWidth,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedLineWidth,
  APP_SETTINGS_STORAGE_KEYS.nodeIconPendingColor,
  APP_SETTINGS_STORAGE_KEYS.nodeIconScheduledColor,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedColor,
  APP_SETTINGS_STORAGE_KEYS.nodeIconPrimarySvg,
  APP_SETTINGS_STORAGE_KEYS.nodeIconSecondarySvg,
  APP_SETTINGS_STORAGE_KEYS.nodeIconReviewVariantMode,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeEnabled,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeOpacity,
  APP_SETTINGS_STORAGE_KEYS.nodeIconDismissedFadeWholeRow,
  APP_SETTINGS_STORAGE_KEYS.nodeListRowSpacing,
  APP_SETTINGS_STORAGE_KEYS.listCollapsed,
  APP_SETTINGS_STORAGE_KEYS.rightSidebarCollapsed,
  APP_SETTINGS_STORAGE_KEYS.managedInboxPath,
  APP_SETTINGS_STORAGE_KEYS.commandRecents,
  APP_SETTINGS_STORAGE_KEYS.nodePaletteRecents,
  APP_SETTINGS_STORAGE_KEYS.commandShortcutOverrides
]);

function assertLocalStorageWhitelist(key: string) {
  if (!LOCAL_STORAGE_WHITELIST.has(key)) {
    throw new Error(`[storage] key is not in localStorage whitelist: ${key}`);
  }
}

function canUseLocalStorage() {
  return typeof window !== 'undefined';
}

function readWhitelistedLocalStorageSnapshot() {
  const snapshot: Record<string, string> = {};
  if (!canUseLocalStorage()) {
    return snapshot;
  }
  for (const key of LOCAL_STORAGE_WHITELIST) {
    const value = window.localStorage.getItem(key);
    if (typeof value === 'string') {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function persistSnapshotToRuntimeStorage() {
  const settings = readWhitelistedLocalStorageSnapshot();
  void saveRuntimeAppSettingsState(settings);
}

export function getWhitelistedLocalStorageItem(key: string): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  assertLocalStorageWhitelist(key);
  return window.localStorage.getItem(key);
}

export function setWhitelistedLocalStorageItem(key: string, value: string) {
  if (!canUseLocalStorage()) {
    return;
  }
  assertLocalStorageWhitelist(key);
  window.localStorage.setItem(key, value);
  persistSnapshotToRuntimeStorage();
}

export function removeWhitelistedLocalStorageItem(key: string) {
  if (!canUseLocalStorage()) {
    return;
  }
  assertLocalStorageWhitelist(key);
  window.localStorage.removeItem(key);
  persistSnapshotToRuntimeStorage();
}

export function getLocalStorageWhitelist() {
  return Array.from(LOCAL_STORAGE_WHITELIST);
}
