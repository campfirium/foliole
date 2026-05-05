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

  const handleMinimize = () => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(() => getCurrentWindow().minimize());
  };

  const handleToggleMaximize = () => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(() => getCurrentWindow().toggleMaximize());
  };

  const handleClose = () => {
    if (!controlsEnabled) {
      return;
    }
    runWindowAction(() => getCurrentWindow().close());
  };

  return (
    <header className="window-titlebar" data-tauri-drag-region>
      <div className="window-titlebar-title" data-tauri-drag-region>
        Foliole
      </div>
      <div className="window-titlebar-controls" data-tauri-drag-region="false">
        <button
          aria-label="Minimize window"
          className="window-titlebar-button"
          data-tauri-drag-region="false"
          disabled={!controlsEnabled}
          onClick={handleMinimize}
          type="button"
        >
          _
        </button>
        <button
          aria-label="Toggle maximize window"
          className="window-titlebar-button"
          data-tauri-drag-region="false"
          disabled={!controlsEnabled}
          onClick={handleToggleMaximize}
          type="button"
        >
          []
        </button>
        <button
          aria-label="Close window"
          className="window-titlebar-button window-titlebar-button-close"
          data-tauri-drag-region="false"
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
