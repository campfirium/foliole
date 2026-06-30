import { app, BrowserWindow } from 'electron';

import { desktopTaskScheduler } from './desktopTaskScheduler.js';
import { createExternalSearchBackgroundRefreshController } from './externalSearchBackgroundRefresh.js';

const externalSearchBackgroundRefresh = createExternalSearchBackgroundRefreshController({
  rebuild: () =>
    desktopTaskScheduler.submit({
      cancellable: true,
      concurrencyKey: 'external-search-refresh',
      duplicatePolicy: 'coalesce',
      failureLabel: '[external-search] background refresh failed',
      id: 'external-search-refresh',
      label: 'External search refresh',
      priority: 'background',
      run: (context) =>
        import('./database/externalSearchCache.js').then((module) =>
          module.refreshExternalSearchIndexes(undefined, { taskContext: context })
        ),
      runOn: 'main',
      source: 'external-search'
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
