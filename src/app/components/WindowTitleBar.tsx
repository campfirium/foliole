import { Copy, HardDrive, Minus, PanelLeft, PanelRight, Square, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react';
import { workspaceChangeTimestamp } from 'virtual:workspace-change-timestamp';

import { useRuntimeAvailability } from '../../shared/platform/runtimeAvailability';
import {
  closeMainWindow,
  isWindowControlsAvailable,
  minimizeMainWindow,
  onMainWindowResized,
  queryMainWindowMaximized,
  toggleMainWindowMaximize
} from '../../shared/platform/windowControls';

import { WindowTitleBarRightSidebarAnchor } from './WindowTitleBarRightSidebarAnchor';
import { WindowTitleBarViewButtons } from './WindowTitleBarViewButtons';
import { WorkspaceSurfaceRowOverlay, WorkspaceTitlebarDividers } from './WorkspaceSurfaceRowOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;
const WINDOW_CONTROLS_WIDTH = 138;
interface WindowTitleBarProps {
  activeRightPanelId: WorkspaceRightPanelId;
  centerTitle: string | null;
  centerTitleIcon?: 'external';
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isTrashViewOpen: boolean;
  listWidth: number;
  onSelectRightPanel: (panelId: WorkspaceRightPanelId) => void;
  onToggleRightSidebarVisibility: () => void;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onToggleListVisibility: () => void;
  rightSidebarWidth: number;
}

interface WindowControlButtonsProps {
  controlsEnabled: boolean;
  isMaximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
}

function runWindowAction(action: () => Promise<void>) {
  void action().catch((error) => {
    console.error('[window-titlebar] window action failed', error);
  });
}

function useWindowControlState() {
  const controlsEnabled = useRuntimeAvailability(isWindowControlsAvailable);
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximizedState = useCallback(async () => {
    if (!controlsEnabled) {
      setIsMaximized(false);
      return;
    }
    setIsMaximized(await queryMainWindowMaximized());
  }, [controlsEnabled]);

  useEffect(() => {
    if (!controlsEnabled) {
      setIsMaximized(false);
      return;
    }

    void syncMaximizedState();
    let unlisten: (() => void) | undefined;
    void onMainWindowResized(() => {
      void syncMaximizedState();
    })
      .then((dispose) => {
        unlisten = dispose ?? undefined;
      })
      .catch((error) => {
        console.error('[window-titlebar] failed to subscribe resize listener', error);
      });
    return () => {
      unlisten?.();
    };
  }, [controlsEnabled, syncMaximizedState]);

  return {
    controlsEnabled,
    isMaximized,
    syncMaximizedState
  };
}
function SidebarToggleButton({
  active,
  label,
  onClick,
  side
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  side: 'left' | 'right';
}) {
  return (
    <button
      aria-label={label}
      className="window-titlebar-leading-button"
      data-active={active}
      onClick={onClick}
      type="button"
    >
      {side === 'left' ? (
        <PanelLeft aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      ) : (
        <PanelRight aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      )}
    </button>
  );
}

function WindowLeadingActions({
  isListCollapsed,
  isTrashViewOpen,
  onOpenNotesView,
  onToggleListVisibility
}: WindowTitleBarProps) {
  if (isListCollapsed) {
    return (
      <div className="window-titlebar-left-zone relative z-[3]" data-collapsed="true">
        <div className="window-titlebar-collapsed-left-action">
          <SidebarToggleButton active={false} label="Toggle left panel" onClick={onToggleListVisibility} side="left" />
        </div>
      </div>
    );
  }

  return (
    <div className="window-titlebar-left-zone relative z-[3]" data-collapsed="false">
      <div className="window-titlebar-leading">
        <div className="window-titlebar-leading-primary">
          <SidebarToggleButton active={!isListCollapsed} label="Toggle left panel" onClick={onToggleListVisibility} side="left" />
        </div>
        <div className="window-titlebar-leading-secondary">
          <WindowTitleBarViewButtons
            isTrashViewOpen={isTrashViewOpen}
            onOpenNotesView={onOpenNotesView}
          />
          <span aria-label="Current change timestamp" className="window-titlebar-left-timestamp">
            {workspaceChangeTimestamp}
          </span>
        </div>
      </div>
    </div>
  );
}

function WindowControlButtons({ controlsEnabled, isMaximized, onClose, onMinimize, onToggleMaximize }: WindowControlButtonsProps) {
  return (
    <div className="window-titlebar-controls">
      <button aria-label="Minimize" className="window-titlebar-button" disabled={!controlsEnabled} onClick={onMinimize} type="button">
        <Minus aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
      <button
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        className="window-titlebar-button"
        disabled={!controlsEnabled}
        onClick={onToggleMaximize}
        type="button"
      >
        {isMaximized ? (
          <Copy aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        ) : (
          <Square aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        )}
      </button>
      <button
        aria-label="Close"
        className="window-titlebar-button window-titlebar-button-close"
        disabled={!controlsEnabled}
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
      </button>
    </div>
  );
}

function WindowCenterTitle({ icon, onDoubleClick, title }: { icon?: 'external'; onDoubleClick: () => void; title: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="window-titlebar-center-slot window-titlebar-drag-fill relative z-[3]"
      onDoubleClick={onDoubleClick}
    >
      {title ? (
        <span className="window-titlebar-center-title gap-1.5" title={title}>
          <span className="min-w-0 truncate" title={title}>{title}</span>
          {icon === 'external' ? <HardDrive aria-hidden="true" className="flex-none" size={14} strokeWidth={1.7} /> : null}
        </span>
      ) : null}
    </div>
  );
}

function getWindowTitleBarStyle(props: WindowTitleBarProps): CSSProperties {
  return {
    '--window-titlebar-left-width': props.isListCollapsed
      ? 'var(--workspace-rail-width)'
      : `calc(var(--workspace-rail-width) + ${props.listWidth + 1}px)`,
    '--window-titlebar-controls-width': `${WINDOW_CONTROLS_WIDTH}px`,
    '--window-titlebar-right-width': props.isRightSidebarCollapsed
      ? `${WINDOW_CONTROLS_WIDTH + 40}px`
      : `${props.rightSidebarWidth}px`,
    '--workspace-list-width': `${props.listWidth}px`,
    '--workspace-titlebar-folder-column-width': props.isListCollapsed ? '0px' : 'var(--workspace-folder-column-width)',
    '--workspace-titlebar-list-current-width': props.isListCollapsed
      ? '0px'
      : 'var(--workspace-list-current-width, 300px)'
  } as CSSProperties;
}

export const WindowTitleBar = memo(function WindowTitleBar(props: WindowTitleBarProps) {
  const { controlsEnabled, isMaximized, syncMaximizedState } = useWindowControlState();

  const handleMinimize = useCallback(() => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(minimizeMainWindow);
  }, [controlsEnabled]);

  const handleToggleMaximize = useCallback(() => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(async () => {
      await toggleMainWindowMaximize();
      await syncMaximizedState();
    });
  }, [controlsEnabled, syncMaximizedState]);

  const handleClose = useCallback(() => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(closeMainWindow);
  }, [controlsEnabled]);

  return (
    <header
      className="window-titlebar"
      data-window-maximized={isMaximized}
      style={getWindowTitleBarStyle(props)}
    >
      <WorkspaceSurfaceRowOverlay row="titlebar" />
      <WorkspaceTitlebarDividers
        isListCollapsed={props.isListCollapsed}
        isRightSidebarCollapsed={props.isRightSidebarCollapsed}
      />
      <WindowLeadingActions {...props} />
      <WindowCenterTitle icon={props.centerTitleIcon} onDoubleClick={handleToggleMaximize} title={props.centerTitle} />
      <WindowTitleBarRightSidebarAnchor
        activeRightPanelId={props.activeRightPanelId}
        isRightSidebarCollapsed={props.isRightSidebarCollapsed}
        onSelectRightPanel={props.onSelectRightPanel}
        onToggleRightSidebarVisibility={props.onToggleRightSidebarVisibility}
      />
      <WindowControlButtons
        controlsEnabled={controlsEnabled}
        isMaximized={isMaximized}
        onClose={handleClose}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
      />
    </header>
  );
});
