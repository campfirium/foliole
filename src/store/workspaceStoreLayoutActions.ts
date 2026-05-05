import type { StoreApi } from 'zustand';

import { normalizeWidth } from './workspaceHelpers';
import {
  saveListCollapsedPreference,
  saveRightSidebarCollapsedPreference
} from './workspaceLayoutPrefs';
import type { WorkspaceState } from './workspaceStore';

function setLayoutWidth(
  set: StoreApi<WorkspaceState>['setState'],
  key: 'documentMaxWidth' | 'listWidth' | 'rightSidebarWidth',
  width: number
) {
  const normalizedWidth = normalizeWidth(width);
  if (!normalizedWidth) {
    return;
  }
  set((state) => ({
    layout: {
      ...state.layout,
      ...(key === 'listWidth' ? { isListCollapsed: false } : {}),
      ...(key === 'rightSidebarWidth' ? { isRightSidebarCollapsed: false } : {}),
      [key]: normalizedWidth
    }
  }));
}

function setLayoutCollapsed(
  set: StoreApi<WorkspaceState>['setState'],
  key: 'isListCollapsed' | 'isRightSidebarCollapsed',
  collapsed: boolean
) {
  if (key === 'isListCollapsed') {
    saveListCollapsedPreference(collapsed);
  } else {
    saveRightSidebarCollapsedPreference(collapsed);
  }
  set((state) => ({
    layout: {
      ...state.layout,
      [key]: collapsed
    }
  }));
}

export function createWorkspaceLayoutActions(
  set: StoreApi<WorkspaceState>['setState'],
  defaultLayoutState: WorkspaceState['layout']
) {
  return {
    resetLayout: () => {
      saveListCollapsedPreference(false);
      saveRightSidebarCollapsedPreference(false);
      set({ layout: { ...defaultLayoutState } });
    },
    setDocumentMaxWidth: (width: number) => setLayoutWidth(set, 'documentMaxWidth', width),
    setListWidth: (width: number) => setLayoutWidth(set, 'listWidth', width),
    setListCollapsed: (collapsed: boolean) => setLayoutCollapsed(set, 'isListCollapsed', collapsed),
    setRightSidebarWidth: (width: number) => setLayoutWidth(set, 'rightSidebarWidth', width),
    setRightSidebarCollapsed: (collapsed: boolean) =>
      setLayoutCollapsed(set, 'isRightSidebarCollapsed', collapsed)
  };
}
