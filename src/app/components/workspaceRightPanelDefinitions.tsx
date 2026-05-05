import { Bug, FileSearch, Gauge, Highlighter, Link2, ListOrdered } from 'lucide-react';

import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

export interface WorkspaceRightPanelDefinition {
  icon: JSX.Element;
  menuLabel: string;
  panelId: WorkspaceRightPanelId;
}

export const WORKSPACE_RIGHT_PANEL_DEFINITIONS: WorkspaceRightPanelDefinition[] = [
  {
    icon: <ListOrdered aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Review queue',
    panelId: 'review-queue'
  },
  {
    icon: <FileSearch aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Source info',
    panelId: 'source-info'
  },
  {
    icon: <Highlighter aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Highlights',
    panelId: 'highlights'
  },
  {
    icon: <Link2 aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Backlinks',
    panelId: 'backlinks'
  },
  {
    icon: <Gauge aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Performance',
    panelId: 'performance'
  },
  {
    icon: <Bug aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Dev',
    panelId: 'dev'
  }
];

export function getWorkspaceRightPanelAriaLabel(panelId: WorkspaceRightPanelId) {
  return `${getWorkspaceRightPanelDefinition(panelId).menuLabel} panel`;
}

export function getWorkspaceRightPanelDefinition(panelId: WorkspaceRightPanelId) {
  const definition = WORKSPACE_RIGHT_PANEL_DEFINITIONS.find((item) => item.panelId === panelId);
  if (!definition) {
    throw new Error(`unknown workspace right panel: ${panelId}`);
  }
  return definition;
}
