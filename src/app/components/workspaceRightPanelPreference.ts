import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export const RIGHT_PANEL_IDS: WorkspaceRightPanelId[] = [
  'review-queue',
  'source-info',
  'highlights',
  'backlinks',
  'performance',
  'dev'
];

function isWorkspaceRightPanelId(value: string | null): value is WorkspaceRightPanelId {
  return value !== null && RIGHT_PANEL_IDS.includes(value as WorkspaceRightPanelId);
}

export function loadWorkspaceRightPanelPreference(fallback: WorkspaceRightPanelId = 'source-info') {
  const value = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarActivePanel);
  return isWorkspaceRightPanelId(value) ? value : fallback;
}

export function saveWorkspaceRightPanelPreference(value: WorkspaceRightPanelId) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarActivePanel, value);
}

export function loadWorkspaceRightPanelOrderPreference() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarPanelOrder);
}

export function saveWorkspaceRightPanelOrderPreference(value: WorkspaceRightPanelId[]) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.rightSidebarPanelOrder, value.join(','));
}
