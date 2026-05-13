import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { parseLiteralUnion } from '../../shared/lib/parseLiteralUnion';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export const RIGHT_PANEL_IDS: WorkspaceRightPanelId[] = [
  'review-queue',
  'source-info',
  'outline',
  'highlights',
  'backlinks',
  'performance',
  'dev'
];

function isWorkspaceRightPanelId(value: string | null): value is WorkspaceRightPanelId {
  return parseLiteralUnion(value, RIGHT_PANEL_IDS) !== null;
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
