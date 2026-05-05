import { Copy, FileText, Minus, PanelLeft, PanelRight, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
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
import type { WorkspaceRightPanelId } from './WorkspaceTopToolbar';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

interface WindowTitleBarProps {
  activeRightPanelId: WorkspaceRightPanelId;
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
  onOpenTrashView,
  onToggleListVisibility
}: WindowTitleBarProps) {
  if (isListCollapsed) {
    return (
      <div className="window-titlebar-left-zone" data-collapsed="true">
        <div className="window-titlebar-collapsed-left-action">
          <SidebarToggleButton active={false} label="Toggle left panel" onClick={onToggleListVisibility} side="left" />
        </div>
      </div>
    );
  }

  return (
    <div className="window-titlebar-left-zone" data-collapsed="false">
      <div className="window-titlebar-leading">
        <div className="window-titlebar-leading-primary">
          <SidebarToggleButton active={!isListCollapsed} label="Toggle left panel" onClick={onToggleListVisibility} side="left" />
        </div>
        <div className="window-titlebar-leading-secondary">
          <div className="window-titlebar-leading-actions">
            <button
              aria-label="Notes"
              className="window-titlebar-leading-button"
              data-active={!isTrashViewOpen}
              onClick={onOpenNotesView}
              type="button"
            >
              <FileText aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
            </button>
            <button
              aria-label="Trash"
              className="window-titlebar-leading-button"
              data-active={isTrashViewOpen}
              onClick={onOpenTrashView}
              type="button"
            >
              <Trash2 aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
            </button>
          </div>
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

export function WindowTitleBar(props: WindowTitleBarProps) {
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
    <header className="window-titlebar" data-window-maximized={isMaximized} style={{ '--workspace-list-width': `${props.listWidth}px` } as CSSProperties}>
      <WindowLeadingActions {...props} />
      <div className="window-titlebar-drag-fill" onDoubleClick={handleToggleMaximize} />
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
}
