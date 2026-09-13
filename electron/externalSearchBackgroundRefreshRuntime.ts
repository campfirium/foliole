import { app, BrowserWindow } from 'electron';

import { submitDesktopOperation } from './desktopOperations.js';
import { createExternalSearchBackgroundRefreshController } from './externalSearchBackgroundRefresh.js';

const externalSearchBackgroundRefresh = createExternalSearchBackgroundRefreshController({
  rebuild: () =>
    submitDesktopOperation('external-search-refresh', {
      failureLabel: '[external-search] background refresh failed',
      run: (context) =>
        import('./database/externalSearchCache.js').then((module) =>
          module.refreshExternalSearchIndexes(undefined, { taskContext: context })
        )
    }).promise
});

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

export async function pauseExternalSearchBackgroundRefresh() {
  await externalSearchBackgroundRefresh.pause();
}
