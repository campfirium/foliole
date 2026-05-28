import { VISIBLE_RIGHT_PANEL_IDS } from './workspaceRightPanelPreference';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

export function normalizeWorkspaceRightPanelOrder(value: string | null) {
  if (!value) {
    return [...VISIBLE_RIGHT_PANEL_IDS];
  }

  const nextOrder = value
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is WorkspaceRightPanelId => VISIBLE_RIGHT_PANEL_IDS.includes(item as WorkspaceRightPanelId));

  for (const panelId of VISIBLE_RIGHT_PANEL_IDS) {
    if (!nextOrder.includes(panelId)) {
      nextOrder.push(panelId);
    }
  }

  return nextOrder;
}

export function moveWorkspaceRightPanel(order: WorkspaceRightPanelId[], sourceId: WorkspaceRightPanelId, targetId: WorkspaceRightPanelId) {
  if (sourceId === targetId) {
    return order;
  }

  const nextOrder = [...order];
  const sourceIndex = nextOrder.indexOf(sourceId);
  const targetIndex = nextOrder.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return order;
  }

  nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, sourceId);
  return nextOrder;
}
