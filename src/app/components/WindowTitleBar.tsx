import { getCurrentWindow } from '@tauri-apps/api/window';

type TauriRuntimeWindow = Window & { __TAURI__?: unknown };

function isTauriRuntime() {
  return typeof window !== 'undefined' && Boolean((window as TauriRuntimeWindow).__TAURI__);
}

function runWindowAction(action: () => Promise<void>) {
  void action().catch((error) => {
    console.error('[window-titlebar] window action failed', error);
  });
}

export function WindowTitleBar() {
  const controlsEnabled = isTauriRuntime();
  const appWindow = controlsEnabled ? getCurrentWindow() : null;

  const handleMinimize = () => {
    if (!appWindow) {
      return;
    }
    runWindowAction(() => appWindow.minimize());
  };

  const handleToggleMaximize = () => {
    if (!appWindow) {
      return;
    }
    runWindowAction(() => appWindow.toggleMaximize());
  };

  const handleClose = () => {
    if (!appWindow) {
      return;
    }
    runWindowAction(() => appWindow.close());
  };

  const handleTitleDoubleClick = () => {
    if (!appWindow) {
      return;
    }
    runWindowAction(() => appWindow.toggleMaximize());
  };

  return (
    <header className="window-titlebar">
      <div className="window-titlebar-title" data-tauri-drag-region>
        Foliole
      </div>
      <div className="window-titlebar-drag-fill" data-tauri-drag-region onDoubleClick={handleTitleDoubleClick} />
      <div className="window-titlebar-controls">
        <button
          aria-label="Minimize window"
          className="window-titlebar-button"
          disabled={!controlsEnabled}
          onClick={handleMinimize}
          type="button"
        >
          -
        </button>
        <button
          aria-label="Toggle maximize window"
          className="window-titlebar-button"
          disabled={!controlsEnabled}
          onClick={handleToggleMaximize}
          type="button"
        >
          [ ]
        </button>
        <button
          aria-label="Close window"
          className="window-titlebar-button window-titlebar-button-close"
          disabled={!controlsEnabled}
          onClick={handleClose}
          type="button"
        >
          X
        </button>
      </div>
    </header>
  );
}
