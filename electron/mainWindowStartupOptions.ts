import { screen, type BrowserWindowConstructorOptions } from 'electron';

import { appendBootEvent } from './ipc/boot.js';
import { loadWindowState } from './ipc/windowState.js';
import { applyHiddenNativeDesktopWindowOptions } from './runtimeMainSupport.js';
import { loadStartupWindowState } from './startupWindowState.js';
import { applyWindowStateToOptions } from './windowStateLifecycle.js';

export async function prepareMainWindowStartupOptions(
  baseOptions: BrowserWindowConstructorOptions,
  startupAppearance: { backgroundColor: string } | null | undefined,
  deferDatabaseBackedBindings: boolean
) {
  await appendBootEvent('main_window_create_start');
  const restoredWindowState = await loadStartupWindowState({
    appendBootEvent,
    env: deferDatabaseBackedBindings
      ? { ...process.env, FOLIOLE_SKIP_STARTUP_WINDOW_STATE: '1' }
      : process.env,
    loadWindowState
  });
  await appendBootEvent('window_state_loaded', restoredWindowState);
  let options = applyWindowStateToOptions(
    baseOptions,
    restoredWindowState,
    screen.getAllDisplays().map((display) => display.workArea)
  );
  options = applyHiddenNativeDesktopWindowOptions(options);
  if (startupAppearance?.backgroundColor) options.backgroundColor = startupAppearance.backgroundColor;
  return { options, restoredWindowState };
}
