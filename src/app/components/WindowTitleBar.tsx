import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';

type TauriRuntimeWindow = Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };

function isTauriRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }
  const runtimeWindow = window as TauriRuntimeWindow;
  return Boolean(runtimeWindow.__TAURI__ || runtimeWindow.__TAURI_INTERNALS__);
}

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
  const controlsEnabled = isTauriRuntime();
  const appWindow = useMemo(() => (controlsEnabled ? getCurrentWindow() : null), [controlsEnabled]);
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximizedState = useCallback(async () => {
    if (!appWindow) {
      setIsMaximized(false);
      return;
    }
    const maximized = await appWindow.isMaximized();
    setIsMaximized(maximized);
  }, [appWindow]);

  useEffect(() => {
    if (!appWindow) {
      setIsMaximized(false);
      return;
    }

    void syncMaximizedState();
    let unlisten: (() => void) | undefined;
    void appWindow
      .onResized(() => {
        void syncMaximizedState();
      })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch((error) => {
        console.error('[window-titlebar] failed to subscribe resize listener', error);
      });

    return () => {
      unlisten?.();
    };
  }, [appWindow, syncMaximizedState]);

  const handleMinimize = useCallback(() => {
    if (!appWindow) {
      return;
    }
    runWindowAction(() => appWindow.minimize());
  }, [appWindow]);

  const handleToggleMaximize = useCallback(() => {
    if (!appWindow) {
      return;
    }
    runWindowAction(async () => {
      await appWindow.toggleMaximize();
      await syncMaximizedState();
    });
  }, [appWindow, syncMaximizedState]);

  const handleClose = useCallback(() => {
    if (!appWindow) {
      return;
    }
    runWindowAction(() => appWindow.close());
  }, [appWindow]);

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
              <ToggleSidebarIcon />
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
              <NotesIcon />
            </button>
            <button
              aria-label="Trash"
              className="window-titlebar-leading-button"
              data-active={isTrashViewOpen}
              onClick={onOpenTrashView}
              type="button"
            >
              <TrashIcon />
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
          <MinimizeIcon />
        </button>
        <button
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          className="window-titlebar-button"
          disabled={!controlsEnabled}
          onClick={handleToggleMaximize}
          type="button"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          aria-label="Close"
          className="window-titlebar-button window-titlebar-button-close"
          disabled={!controlsEnabled}
          onClick={handleClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}

function ToggleSidebarIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-leading-icon" viewBox="0 0 16 16">
      <path d="M2.5 3h11v10h-11z" />
      <path d="M5.2 3v10" />
      <path d="M3.9 8h1.6" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-leading-icon" viewBox="0 0 16 16">
      <path d="M3 2.5h10v11H3z" />
      <path d="M5 5h6M5 8h6M5 11h4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-leading-icon" viewBox="0 0 16 16">
      <path d="M3.5 4.5h9" />
      <path d="M6 2.8h4" />
      <path d="M5 4.5v8h6v-8" />
      <path d="M7 6.5v4M9 6.5v4" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-icon" viewBox="0 0 10 10">
      <path d="M1 5.5h8" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-icon" viewBox="0 0 10 10">
      <rect height="6" width="6" x="2" y="2" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-icon" viewBox="0 0 10 10">
      <path d="M3 1.5h5v5" />
      <path d="M2 3.5h5v5H2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="window-titlebar-icon" viewBox="0 0 10 10">
      <path d="M2 2l6 6M8 2L2 8" />
    </svg>
  );
}
