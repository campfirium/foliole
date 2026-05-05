import { app, BrowserWindow } from 'electron';

import { createExternalSearchBackgroundRefreshController } from './externalSearchBackgroundRefresh.js';

const externalSearchBackgroundRefresh = createExternalSearchBackgroundRefreshController();

export function startExternalSearchBackgroundRefresh() {
  externalSearchBackgroundRefresh.start();
  app.on('browser-window-focus', notifyExternalSearchUserActivity);
}

export function notifyExternalSearchUserActivity() {
  externalSearchBackgroundRefresh.notifyUserActivity();
}

export function notifyExternalSearchFoldersChanged() {
  externalSearchBackgroundRefresh.refreshNow();
}

export function stopExternalSearchBackgroundRefresh() {
  app.removeListener('browser-window-focus', notifyExternalSearchUserActivity);
  externalSearchBackgroundRefresh.stop();
}

export function notifyExternalSearchSecondInstance() {
  if (BrowserWindow.getAllWindows().length > 0) {
    notifyExternalSearchUserActivity();
  }
}
