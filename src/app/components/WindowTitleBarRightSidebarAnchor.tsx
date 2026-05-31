import { Grid2x2, PanelRight } from 'lucide-react';
import { memo, useEffect, useState, type DragEvent as ReactDragEvent } from 'react';

import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from '../../shared/ui';

import { resolveRightPanelAvailableWidthFromSidebarWidth, resolveVisibleRightPanelCount } from './windowTitleBarRightPanelVisibility';
import { getWorkspaceRightPanelAriaLabel, getWorkspaceRightPanelDefinition } from './workspaceRightPanelDefinitions';
import { moveWorkspaceRightPanel, normalizeWorkspaceRightPanelOrder } from './workspaceRightPanelOrder';
import { loadWorkspaceRightPanelOrderPreference, saveWorkspaceRightPanelOrderPreference } from './workspaceRightPanelPreference';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;
const MAX_VISIBLE_PANEL_COUNT = 3;
const RIGHT_PANEL_ACTION_BASE_CLASS = 'window-titlebar-leading-button relative';
const RIGHT_PANEL_ACTION_ACTIVE_CLASS =
  'after:absolute after:bottom-1 after:left-1 after:right-1 after:h-[2px] after:rounded-full after:bg-foreground/12';

function RightSidebarToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      aria-label="Toggle right sidebar"
      className="window-titlebar-leading-button"
      aria-pressed={active}
      onClick={onClick}
      type="button"
    >
      <PanelRight aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
    </button>
  );
}

function RightSidebarPanelButton(props: {
  active: boolean;
  onClick: () => void;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  panelId: WorkspaceRightPanelId;
}) {
  const definition = getWorkspaceRightPanelDefinition(props.panelId);
  return (
    <button
      aria-label={getWorkspaceRightPanelAriaLabel(props.panelId)}
      aria-pressed={props.active}
      className={[
        RIGHT_PANEL_ACTION_BASE_CLASS,
        props.active ? RIGHT_PANEL_ACTION_ACTIVE_CLASS : ''
      ].filter(Boolean).join(' ')}
      data-panel-id={props.panelId}
      draggable
      onClick={props.onClick}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDragStart={props.onDragStart}
      onDrop={props.onDragOver}
      type="button"
    >
      {definition.icon}
    </button>
  );
}

interface WindowTitleBarRightSidebarAnchorProps {
  activeRightPanelId: WorkspaceRightPanelId;
  isRightSidebarCollapsed: boolean;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleRightSidebarVisibility: () => void;
  rightSidebarWidth: number;
}

function useWorkspaceRightPanelOrder() {
  const [orderedPanelIds, setOrderedPanelIds] = useState<WorkspaceRightPanelId[]>(() =>
    normalizeWorkspaceRightPanelOrder(loadWorkspaceRightPanelOrderPreference())
  );

  useEffect(() => {
    saveWorkspaceRightPanelOrderPreference(orderedPanelIds);
  }, [orderedPanelIds]);

  return {
    orderedPanelIds,
    setOrderedPanelIds
  };
}

function useWorkspaceRightPanelDrag(orderState: ReturnType<typeof useWorkspaceRightPanelOrder>) {
  const [draggingPanelId, setDraggingPanelId] = useState<WorkspaceRightPanelId | null>(null);

  function reorderTo(targetId: WorkspaceRightPanelId) {
    if (!draggingPanelId) {
      return;
    }
    orderState.setOrderedPanelIds((currentOrder) => moveWorkspaceRightPanel(currentOrder, draggingPanelId, targetId));
  }

  return {
    draggingPanelId,
    handleDragEnd: () => setDraggingPanelId(null),
    handleDragOver: (targetId: WorkspaceRightPanelId, event: ReactDragEvent<HTMLElement>) => {
      if (!draggingPanelId || draggingPanelId === targetId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      reorderTo(targetId);
    },
    handleDragStart: (panelId: WorkspaceRightPanelId, event: ReactDragEvent<HTMLElement>) => {
      setDraggingPanelId(panelId);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', panelId);
    }
  };
}

function renderVisiblePanelActions(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  drag: ReturnType<typeof useWorkspaceRightPanelDrag>;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  orderedPanelIds: WorkspaceRightPanelId[];
  visiblePanelCount: number;
}) {
  return args.orderedPanelIds.slice(0, args.visiblePanelCount).map((panelId) => (
    <RightSidebarPanelButton
      key={panelId}
      active={args.activeRightPanelId === panelId}
      onClick={() => args.onSelectRightPanel(panelId)}
      onDragEnd={args.drag.handleDragEnd}
      onDragOver={(event) => args.drag.handleDragOver(panelId, event)}
      onDragStart={(event) => args.drag.handleDragStart(panelId, event)}
      panelId={panelId}
    />
  ));
}

function OverflowPanelMenu(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  drag: ReturnType<typeof useWorkspaceRightPanelDrag>;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  orderedPanelIds: WorkspaceRightPanelId[];
  visiblePanelCount: number;
}) {
  const overflowPanelIds = args.orderedPanelIds.slice(args.visiblePanelCount);
  const isActive = overflowPanelIds.includes(args.activeRightPanelId) || !args.orderedPanelIds.includes(args.activeRightPanelId);
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label="More right sidebar panels"
          aria-pressed={isActive}
          className={[
            RIGHT_PANEL_ACTION_BASE_CLASS,
            isActive ? RIGHT_PANEL_ACTION_ACTIVE_CLASS : ''
          ].filter(Boolean).join(' ')}
          type="button"
        >
          <Grid2x2 aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="min-w-[188px]" sideOffset={6}>
        {args.orderedPanelIds.map((panelId) => {
          const definition = getWorkspaceRightPanelDefinition(panelId);
          const isPinned = !overflowPanelIds.includes(panelId);
          return (
            <AppDropdownMenuItem
              key={panelId}
              className="gap-2"
              data-panel-id={panelId}
              draggable
              onDragEnd={args.drag.handleDragEnd}
              onDragOver={(event) => args.drag.handleDragOver(panelId, event)}
              onDragStart={(event) => args.drag.handleDragStart(panelId, event)}
              onSelect={() => args.onSelectRightPanel(panelId)}
            >
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center text-foreground/70">
                {definition.icon}
              </span>
              <span className="flex-1">{definition.menuLabel}</span>
              {isPinned ? <span aria-hidden="true" className="text-xs uppercase text-foreground/35">Top</span> : null}
            </AppDropdownMenuItem>
          );
        })}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

function renderRightSidebarPanelActions(args: {
  activeRightPanelId: WorkspaceRightPanelId;
  drag: ReturnType<typeof useWorkspaceRightPanelDrag>;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  orderedPanelIds: WorkspaceRightPanelId[];
  visiblePanelCount: number;
}) {
  return (
    <div className="window-titlebar-right-panel-actions">
      {renderVisiblePanelActions(args)}
      <OverflowPanelMenu {...args} />
    </div>
  );
}

export const WindowTitleBarRightSidebarAnchor = memo(function WindowTitleBarRightSidebarAnchor(
  props: WindowTitleBarRightSidebarAnchorProps
) {
  const isCollapsed = props.isRightSidebarCollapsed;
  const orderState = useWorkspaceRightPanelOrder();
  const drag = useWorkspaceRightPanelDrag(orderState);
  const visiblePanelCount = resolveVisibleRightPanelCount({
    availableWidth: resolveRightPanelAvailableWidthFromSidebarWidth(props.rightSidebarWidth),
    maxCount: MAX_VISIBLE_PANEL_COUNT
  });

  return (
    <div className="window-titlebar-right-anchor-shell relative z-local-control max-[1279px]:hidden" data-collapsed={isCollapsed}>
      <div className="window-titlebar-right-content" data-collapsed={isCollapsed}>
        <div className="window-titlebar-right-expanded-action">
          <RightSidebarToggleButton active={!isCollapsed} onClick={props.onToggleRightSidebarVisibility} />
        </div>
        <div className="window-titlebar-right-zone max-[1279px]:hidden" hidden={isCollapsed}>
          {isCollapsed
            ? null
            : renderRightSidebarPanelActions({
                activeRightPanelId: props.activeRightPanelId,
                drag,
                onSelectRightPanel: props.onSelectRightPanel,
                orderedPanelIds: orderState.orderedPanelIds,
                visiblePanelCount
              })}
        </div>
      </div>
    </div>
  );
});
