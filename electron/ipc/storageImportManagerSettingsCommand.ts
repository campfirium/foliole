import { saveImportManagerSettings } from '../import/importManagerSettings.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';
import { refreshReadwiseApiScheduler } from '../import/readwiseApiScheduler.js';
import { publishWatchedFolderGroupMemberState } from '../sync/desktopSyncGroupMemberStateSession.js';
import { notifyDesktopSyncGroupOverviewChanged } from '../sync/desktopSyncGroupOverviewNotifier.js';

import { readSettingsObject } from './storageCommandSupport.js';

export async function saveImportManagerSettingsAndPublish(value: unknown) {
  const result = saveImportManagerSettings(readSettingsObject(value));
  await refreshKeepImportMonitorFromSettings();
  refreshReadwiseApiScheduler();
  notifyDesktopSyncGroupOverviewChanged();
  await publishWatchedFolderGroupMemberState();
  return result;
}
