import { HardDrive } from 'lucide-react';
import { memo, useCallback, useEffect, useState, type CSSProperties } from 'react';

import { definedProps } from '../../shared/lib/definedProps';
import { useRuntimeAvailability } from '../../shared/platform/runtimeAvailability';
import {
  closeMainWindow,
  isWindowControlsAvailable,
  minimizeMainWindow,
  onMainWindowResized,
  queryMainWindowMaximized,
  toggleMainWindowMaximize
} from '../../shared/platform/windowControls';

import { WindowControlButtons } from './WindowControlButtons';
import { WindowSidebarToggleButton } from './WindowSidebarToggleButton';
import { WINDOW_TITLEBAR_CONTROLS_WIDTH, WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH } from './windowTitleBarLayout';
import { WindowTitleBarRightSidebarAnchor } from './WindowTitleBarRightSidebarAnchor';
import { WorkspaceSurfaceRowOverlay, WorkspaceTitlebarDividers } from './WorkspaceSurfaceRowOverlay';
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

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
  onOpenTrashView: () => void;
  onToggleListVisibility: () => void;
  rightSidebarWidth: number;
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
function WindowLeadingActions({
  isListCollapsed,
  onToggleListVisibility
}: WindowTitleBarProps) {
  if (isListCollapsed) {
    return (
      <div className="window-titlebar-left-zone relative z-local-control" data-collapsed="true">
        <div className="window-titlebar-collapsed-left-action">
          <WindowSidebarToggleButton active={false} label="Toggle left panel" onClick={onToggleListVisibility} side="left" />
        </div>
      </div>
    );
  }

  return (
    <div className="window-titlebar-left-zone relative z-local-control" data-collapsed="false">
      <div className="window-titlebar-leading">
        <div className="window-titlebar-leading-primary">
          <WindowSidebarToggleButton active={!isListCollapsed} label="Toggle left panel" onClick={onToggleListVisibility} side="left" />
        </div>
      </div>
    </div>
  );
}

function WindowCenterTitle({ icon, onDoubleClick, title }: { icon?: 'external'; onDoubleClick: () => void; title: string | null }) {
  return (
    <div
      aria-hidden="true"
      className="window-titlebar-center-slot window-titlebar-drag-fill relative z-local-control"
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
    '--window-titlebar-controls-width': `${WINDOW_TITLEBAR_CONTROLS_WIDTH}px`,
    '--window-titlebar-right-width': props.isRightSidebarCollapsed
      ? `${WINDOW_TITLEBAR_CONTROLS_WIDTH + WINDOW_TITLEBAR_LEADING_BUTTON_WIDTH}px`
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
      <WindowCenterTitle
        onDoubleClick={handleToggleMaximize}
        title={props.centerTitle}
        {...definedProps({ icon: props.centerTitleIcon })}
      />
      <WindowTitleBarRightSidebarAnchor
        activeRightPanelId={props.activeRightPanelId}
        isRightSidebarCollapsed={props.isRightSidebarCollapsed}
        onSelectRightPanel={props.onSelectRightPanel}
        onToggleRightSidebarVisibility={props.onToggleRightSidebarVisibility}
        rightSidebarWidth={props.rightSidebarWidth}
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
