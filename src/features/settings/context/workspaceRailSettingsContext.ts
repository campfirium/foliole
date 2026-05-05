import { createContext, useContext } from 'react';

import type { WorkspaceRailItemConfig } from '../model/workspaceRailSettings';

export interface WorkspaceRailSettingsContextValue {
  items: WorkspaceRailItemConfig[];
  onAddRailItem: (command: { commandId: string; iconId?: string; label: string }) => void;
  onMoveRailItem: (itemId: string, section: 'top' | 'bottom', order: number) => void;
  onRemoveRailItem: (itemId: string) => void;
  onResetRail: () => void;
  onToggleRailItem: (itemId: string, visible: boolean) => void;
}

export const WorkspaceRailSettingsContext = createContext<WorkspaceRailSettingsContextValue | null>(null);

export function useWorkspaceRailSettings() {
  const context = useContext(WorkspaceRailSettingsContext);
  if (!context) {
    throw new Error('WorkspaceRailSettingsProvider is missing.');
  }
  return context;
}
