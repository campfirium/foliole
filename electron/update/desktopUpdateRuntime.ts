import { app, BrowserWindow } from 'electron';

import { markAppQuittingForBackgroundPresence } from '../backgroundPresence.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';
import { IPC_DESKTOP_UPDATE_STATE_EVENT_CHANNEL } from '../ipc/contracts.js';
import { flushWindowReadingProgress } from '../readingProgressWindowFlush.js';

import { isDesktopUpdateApplicable } from './desktopUpdateAvailability.js';
import { DesktopUpdateService, type DesktopUpdaterAdapter } from './desktopUpdateService.js';

function isCurrentBuildApplicable() {
  return isDesktopUpdateApplicable({
    isMas: process.mas === true,
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
  isApplicable: isCurrentBuildApplicable,
  loadUpdater,
  prepareInstall: prepareDesktopUpdateInstall
});
