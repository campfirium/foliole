import type { BrowserWindow } from 'electron';

import { IPC_WINDOW_BLUR_EVENT_CHANNEL } from './ipc/contracts.js';

export function bindWindowBlurEvents(window: BrowserWindow) {
  const publishBlur = () => {
    if (!window.webContents.isDestroyed()) window.webContents.send(IPC_WINDOW_BLUR_EVENT_CHANNEL);
  };
  window.on('blur', publishBlur);
  window.once('closed', () => window.removeListener('blur', publishBlur));
}
