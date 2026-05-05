import type { StoreApi } from 'zustand';

import { normalizeWidth } from './workspaceHelpers';
import {
  saveDocumentWidthPreference,
  saveListCollapsedPreference,
  saveListWidthPreference,
  saveRightSidebarWidthPreference,
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
  if (key === 'documentMaxWidth') {
    saveDocumentWidthPreference(normalizedWidth);
  } else if (key === 'listWidth') {
    saveListWidthPreference(normalizedWidth);
    saveListCollapsedPreference(false);
  } else {
    saveRightSidebarWidthPreference(normalizedWidth);
    saveRightSidebarCollapsedPreference(false);
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
      saveDocumentWidthPreference(defaultLayoutState.documentMaxWidth);
      saveListCollapsedPreference(false);
      saveListWidthPreference(defaultLayoutState.listWidth);
      saveRightSidebarCollapsedPreference(false);
      saveRightSidebarWidthPreference(defaultLayoutState.rightSidebarWidth);
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
