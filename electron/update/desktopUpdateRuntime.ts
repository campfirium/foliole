import path from 'node:path';

import { app, BrowserWindow } from 'electron';

import { markAppQuittingForBackgroundPresence } from '../backgroundPresence.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';
import { IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL } from '../ipc/contracts.js';
import { flushWindowReadingProgress } from '../readingProgressWindowFlush.js';

import { isDesktopUpdateApplicable } from './desktopUpdateAvailability.js';
import { readDesktopDistributionChannel } from './desktopUpdateDistribution.js';
import { DesktopUpdateService, type DesktopUpdaterAdapter } from './desktopUpdateService.js';
import {
  createDesktopUpdateStateStore,
  type DesktopUpdateStateStore
} from './desktopUpdateStateStore.js';

const DESKTOP_UPDATE_STATE_FILE = 'desktop-update-state-v1.json';

function createRuntimeStateStore(): DesktopUpdateStateStore {
  let store: DesktopUpdateStateStore | null = null;
  const resolve = () => {
    store ??= createDesktopUpdateStateStore(
      path.join(app.getPath('userData'), DESKTOP_UPDATE_STATE_FILE)
    );
    return store;
  };
  return {
    clear: () => resolve().clear(),
    read: () => resolve().read(),
    write: (record) => resolve().write(record)
  };
}

function isCurrentBuildApplicable() {
  return isDesktopUpdateApplicable({
    buildChannel: readDesktopDistributionChannel(app.getAppPath()),
    isPackaged: app.isPackaged,
    isWindowsStore: process.windowsStore === true,
    platform: process.platform
  });
}

async function loadUpdater() {
  const updaterModule = await import('electron-updater');
  return updaterModule.autoUpdater as DesktopUpdaterAdapter;
}

async function prepareDesktopUpdateInstall() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!(await flushWindowReadingProgress(window))) {
      appendMainProcessDiagnosticLog('desktop_update_install_flush_failed', {});
      return false;
    }
  }
  markAppQuittingForBackgroundPresence();
  return true;
}

export const desktopUpdateService = new DesktopUpdateService({
  eventChannel: IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL,
  getCurrentVersion: () => app.getVersion(),
  isApplicable: isCurrentBuildApplicable,
  loadUpdater,
  prepareInstall: prepareDesktopUpdateInstall,
  reportDiagnostic: (label) => appendMainProcessDiagnosticLog(label, {}),
  stateStore: createRuntimeStateStore()
});
