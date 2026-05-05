import { useCallback, useMemo, useState, type ReactNode } from 'react';

import {
  addWorkspaceRailItem,
  loadWorkspaceRailItems,
  moveWorkspaceRailItem,
  removeWorkspaceRailItem,
  resetWorkspaceRailItems,
  saveWorkspaceRailItems,
  toggleWorkspaceRailItemVisibility,
  type WorkspaceRailItemConfig
} from '../model/workspaceRailSettings';

import {
  useWorkspaceRailSettings,
  WorkspaceRailSettingsContext
} from './workspaceRailSettingsContext';

function useWorkspaceRailSettingsState() {
  const [items, setItems] = useState<WorkspaceRailItemConfig[]>(() => loadWorkspaceRailItems());

  const updateItems = useCallback((nextItems: WorkspaceRailItemConfig[]) => {
    setItems(nextItems);
    saveWorkspaceRailItems(nextItems);
  }, []);

  return {
    items,
    onAddRailItem: useCallback(
      (command: { commandId: string; iconId?: string; label: string }) =>
        updateItems(addWorkspaceRailItem(items, command)),
      [items, updateItems]
    ),
    onMoveRailItem: useCallback(
      (itemId: string, section: 'top' | 'bottom', order: number) =>
        updateItems(moveWorkspaceRailItem(items, itemId, section, order)),
      [items, updateItems]
    ),
    onRemoveRailItem: useCallback(
      (itemId: string) => updateItems(removeWorkspaceRailItem(items, itemId)),
      [items, updateItems]
    ),
    onResetRail: useCallback(() => updateItems(resetWorkspaceRailItems()), [updateItems]),
    onToggleRailItem: useCallback(
      (itemId: string, visible: boolean) =>
        updateItems(toggleWorkspaceRailItemVisibility(items, itemId, visible)),
      [items, updateItems]
    )
  };
}

export function WorkspaceRailSettingsProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceRailSettingsState();
  const value = useMemo(
    () => ({
      items: state.items,
      onAddRailItem: state.onAddRailItem,
      onMoveRailItem: state.onMoveRailItem,
      onRemoveRailItem: state.onRemoveRailItem,
      onResetRail: state.onResetRail,
      onToggleRailItem: state.onToggleRailItem
    }),
    [
      state.items,
      state.onAddRailItem,
      state.onMoveRailItem,
      state.onRemoveRailItem,
      state.onResetRail,
      state.onToggleRailItem
    ]
  );

  return (
    <WorkspaceRailSettingsContext.Provider value={value}>
      {children}
    </WorkspaceRailSettingsContext.Provider>
  );
}

export { useWorkspaceRailSettings };
