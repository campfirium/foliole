import { app, BrowserWindow, powerMonitor } from 'electron';

let locked = false;
let suspended = false;

export function isReminderForeground() {
  return !locked && !suspended && Boolean(BrowserWindow.getFocusedWindow());
}

export function subscribeReminderForeground(onChange: (focused: boolean) => void) {
  let active = true;
  let previous = false;
  const update = () => {
    if (!active) return;
    const focused = isReminderForeground();
    if (focused === previous) return;
    previous = focused;
    onChange(focused);
  };
  const afterBlur = () => { queueMicrotask(update); };
  const lock = () => { locked = true; update(); };
  const unlock = () => { locked = false; update(); };
  const suspend = () => { suspended = true; update(); };
  const resume = () => { suspended = false; update(); };

  app.on('browser-window-focus', update);
  app.on('browser-window-blur', afterBlur);
  powerMonitor.on('lock-screen', lock);
  powerMonitor.on('unlock-screen', unlock);
  powerMonitor.on('suspend', suspend);
  powerMonitor.on('resume', resume);
  update();
  return () => {
    active = false;
    app.removeListener('browser-window-focus', update);
    app.removeListener('browser-window-blur', afterBlur);
    powerMonitor.removeListener('lock-screen', lock);
    powerMonitor.removeListener('unlock-screen', unlock);
    powerMonitor.removeListener('suspend', suspend);
    powerMonitor.removeListener('resume', resume);
  };
}
