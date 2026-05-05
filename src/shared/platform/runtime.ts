interface TauriBridgeWindow extends Window {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
}

export function isTauriRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }
  const tauriWindow = window as TauriBridgeWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}
