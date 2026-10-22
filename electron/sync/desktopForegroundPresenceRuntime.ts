import { app, BrowserWindow, powerMonitor } from 'electron';

import { setDesktopIdleSecondsSource, updateDesktopFocus } from './desktopForegroundPresence.js';

let installed = false;
let locked = false;
let suspended = false;

export function installDesktopForegroundPresence() {
  if (installed || typeof app?.on !== 'function' || typeof powerMonitor?.on !== 'function') return;
  installed = true;
  setDesktopIdleSecondsSource(() => powerMonitor.getSystemIdleTime());
  const update = () => updateDesktopFocus({
    focused: Boolean(BrowserWindow.getFocusedWindow()), available: !locked && !suspended
  });
  app.on('browser-window-focus', update);
  app.on('browser-window-blur', () => { queueMicrotask(update); });
  powerMonitor.on('lock-screen', () => { locked = true; update(); });
  powerMonitor.on('suspend', () => { suspended = true; update(); });
  powerMonitor.on('unlock-screen', () => { locked = false; update(); });
  powerMonitor.on('resume', () => { suspended = false; update(); });
  update();
}
