import { CalendarClock, Gauge, Highlighter, Link2, TableOfContents, Waypoints } from 'lucide-react';

import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

export interface WorkspaceRightPanelDefinition {
  icon: JSX.Element;
  menuLabel: string;
  panelId: WorkspaceRightPanelId;
  visibleInTitlebar?: boolean;
}

export const WORKSPACE_RIGHT_PANEL_DEFINITIONS: WorkspaceRightPanelDefinition[] = [
  {
    icon: <Waypoints aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Flow',
    panelId: 'review-queue'
  },
  {
    icon: <TableOfContents aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Outline',
    panelId: 'outline'
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
    panelId: 'performance',
    visibleInTitlebar: false
  },
  {
    icon: <CalendarClock aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />,
    menuLabel: 'Scheduling',
    panelId: 'dev'
  }
];

export const WORKSPACE_VISIBLE_RIGHT_PANEL_IDS = WORKSPACE_RIGHT_PANEL_DEFINITIONS
  .filter((item) => item.visibleInTitlebar !== false)
  .map((item) => item.panelId);

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
