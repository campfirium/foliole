import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

export function WindowTitleBar() {
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
    <header className="window-titlebar" data-window-maximized={isMaximized}>
      <div className="window-titlebar-title" data-tauri-drag-region>
        Foliole
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
