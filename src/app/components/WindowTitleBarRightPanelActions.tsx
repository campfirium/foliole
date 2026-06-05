import { Grid2x2 } from 'lucide-react';
import { useState, type Dispatch, type DragEvent as ReactDragEvent, type SetStateAction } from 'react';

import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '../../shared/ui';

import { getWorkspaceRightPanelDefinition } from './workspaceRightPanelDefinitions';
import { moveWorkspaceRightPanel } from './workspaceRightPanelOrder';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;
const RIGHT_PANEL_ACTION_BASE_CLASS = 'window-titlebar-leading-button pointer-events-auto relative';
const RIGHT_PANEL_ACTION_ACTIVE_CLASS =
  'after:absolute after:bottom-1 after:left-1 after:right-1 after:h-[2px] after:rounded-full after:bg-foreground/12';

function getRightPanelLabel(panelId: WorkspaceRightPanelId, t: Translate) {
  if (panelId === 'review-queue') return t('desktop.rightPanel.flow');
  if (panelId === 'outline') return t('desktop.rightPanel.outline');
  if (panelId === 'highlights') return t('desktop.rightPanel.highlights');
  if (panelId === 'backlinks') return t('desktop.rightPanel.backlinks');
  if (panelId === 'performance') return t('desktop.rightPanel.performance');
  return t('desktop.rightPanel.scheduling');
}

function useWorkspaceRightPanelDrag(setOrderedPanelIds: Dispatch<SetStateAction<WorkspaceRightPanelId[]>>) {
  const [draggingPanelId, setDraggingPanelId] = useState<WorkspaceRightPanelId | null>(null);

  return {
    draggingPanelId,
    handleDragEnd: () => setDraggingPanelId(null),
    handleDragOver: (targetId: WorkspaceRightPanelId, event: ReactDragEvent<HTMLElement>) => {
      if (!draggingPanelId || draggingPanelId === targetId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOrderedPanelIds((currentOrder) => moveWorkspaceRightPanel(currentOrder, draggingPanelId, targetId));
    },
    handleDragStart: (panelId: WorkspaceRightPanelId, event: ReactDragEvent<HTMLElement>) => {
      setDraggingPanelId(panelId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', panelId);
    }
  };
}

function RightSidebarPanelButton(props: {
  active: boolean;
  drag: ReturnType<typeof useWorkspaceRightPanelDrag>;
  onClick: () => void;
  panelId: WorkspaceRightPanelId;
  t: Translate;
}) {
  const definition = getWorkspaceRightPanelDefinition(props.panelId);
  const label = getRightPanelLabel(props.panelId, props.t);
  return (
    <button
      aria-label={props.t('desktop.rightPanel.aria', { label })}
      aria-pressed={props.active}
      className={[RIGHT_PANEL_ACTION_BASE_CLASS, props.active ? RIGHT_PANEL_ACTION_ACTIVE_CLASS : ''].filter(Boolean).join(' ')}
      data-panel-id={props.panelId}
      draggable
      onClick={props.onClick}
      onDragEnd={props.drag.handleDragEnd}
      onDragOver={(event) => props.drag.handleDragOver(props.panelId, event)}
      onDragStart={(event) => props.drag.handleDragStart(props.panelId, event)}
      onDrop={(event) => props.drag.handleDragOver(props.panelId, event)}
      type="button"
    >
      {definition.icon}
    </button>
  );
}

function OverflowPanelMenu(props: {
  activeRightPanelId: WorkspaceRightPanelId;
  drag: ReturnType<typeof useWorkspaceRightPanelDrag>;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  orderedPanelIds: WorkspaceRightPanelId[];
  t: Translate;
  visiblePanelCount: number;
}) {
  const overflowPanelIds = props.orderedPanelIds.slice(props.visiblePanelCount);
  if (overflowPanelIds.length === 0) return null;
  const isActive = overflowPanelIds.includes(props.activeRightPanelId) || !props.orderedPanelIds.includes(props.activeRightPanelId);
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={props.t('desktop.workspace.moreRightPanels')}
          aria-pressed={isActive}
          className={[RIGHT_PANEL_ACTION_BASE_CLASS, isActive ? RIGHT_PANEL_ACTION_ACTIVE_CLASS : ''].filter(Boolean).join(' ')}
          type="button"
        >
          <Grid2x2 aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="min-w-[188px]" sideOffset={6}>
        {props.orderedPanelIds.map((panelId) => {
          const definition = getWorkspaceRightPanelDefinition(panelId);
          const isPinned = !overflowPanelIds.includes(panelId);
          return (
            <AppDropdownMenuItem
              key={panelId}
              className="gap-2"
              data-panel-id={panelId}
              draggable
              onDragEnd={props.drag.handleDragEnd}
              onDragOver={(event) => props.drag.handleDragOver(panelId, event)}
              onDragStart={(event) => props.drag.handleDragStart(panelId, event)}
              onSelect={() => props.onSelectRightPanel(panelId)}
            >
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center text-foreground/70">
                {definition.icon}
              </span>
              <span className="flex-1">{getRightPanelLabel(panelId, props.t)}</span>
              {isPinned ? <span aria-hidden="true" className="text-xs uppercase text-foreground/35">{props.t('desktop.workspace.pinnedPanel')}</span> : null}
            </AppDropdownMenuItem>
          );
        })}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function WindowTitleBarRightPanelActions(props: {
  activeRightPanelId: WorkspaceRightPanelId;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  orderedPanelIds: WorkspaceRightPanelId[];
  setOrderedPanelIds: Dispatch<SetStateAction<WorkspaceRightPanelId[]>>;
  visiblePanelCount: number;
}) {
  const t = useTranslation();
  const drag = useWorkspaceRightPanelDrag(props.setOrderedPanelIds);
  return (
    <div className="window-titlebar-right-panel-actions">
      {props.orderedPanelIds.slice(0, props.visiblePanelCount).map((panelId) => (
        <RightSidebarPanelButton
          key={panelId}
          active={props.activeRightPanelId === panelId}
          drag={drag}
          onClick={() => props.onSelectRightPanel(panelId)}
          panelId={panelId}
          t={t}
        />
      ))}
      <OverflowPanelMenu {...props} drag={drag} t={t} />
    </div>
  );
}
