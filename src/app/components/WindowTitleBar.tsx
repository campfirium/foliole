import { Copy, FileText, Minus, PanelLeft, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';

import {
  closeMainWindow,
  isWindowControlsAvailable,
  minimizeMainWindow,
  onMainWindowResized,
  queryMainWindowMaximized,
  toggleMainWindowMaximize
} from '../../shared/platform/windowControls';

const TITLEBAR_ICON_SIZE = 16;
const TITLEBAR_ICON_STROKE = 1.75;

function runWindowAction(action: () => Promise<void>) {
  void action().catch((error) => {
    console.error('[window-titlebar] window action failed', error);
  });
}

interface WindowTitleBarProps {
  isListHidden: boolean;
  isTrashViewOpen: boolean;
  listWidth: number;
  onOpenNotesView: () => void;
  onOpenTrashView: () => void;
  onToggleListVisibility: () => void;
}

export function WindowTitleBar({
  isListHidden,
  isTrashViewOpen,
  listWidth,
  onOpenNotesView,
  onOpenTrashView,
  onToggleListVisibility
}: WindowTitleBarProps) {
  const controlsEnabled = isWindowControlsAvailable();
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximizedState = useCallback(async () => {
    if (!controlsEnabled) {
      setIsMaximized(false);
      return;
    }
    const maximized = await queryMainWindowMaximized();
    setIsMaximized(maximized);
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
    <header className="window-titlebar" data-window-maximized={isMaximized} style={{ '--workspace-list-width': `${listWidth}px` } as CSSProperties}>
      <div className="window-titlebar-left-zone">
        <div className="window-titlebar-leading">
          <div className="window-titlebar-leading-primary">
            <button
              aria-label="Toggle left panel"
              className="window-titlebar-leading-button"
              data-active={isListHidden}
              onClick={onToggleListVisibility}
              type="button"
            >
              <PanelLeft aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
            </button>
          </div>
          <div className="window-titlebar-leading-secondary">
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
        </div>
      </div>
      <div className="window-titlebar-drag-fill" data-tauri-drag-region onDoubleClick={handleToggleMaximize} />
      <div className="window-titlebar-controls">
        <button
          aria-label="Minimize"
          className="window-titlebar-button"
          disabled={!controlsEnabled}
          onClick={handleMinimize}
          type="button"
        >
          <Minus aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        </button>
        <button
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          className="window-titlebar-button"
          disabled={!controlsEnabled}
          onClick={handleToggleMaximize}
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
          onClick={handleClose}
          type="button"
        >
          <X aria-hidden="true" size={TITLEBAR_ICON_SIZE} strokeWidth={TITLEBAR_ICON_STROKE} />
        </button>
      </div>
    </header>
  );
}
