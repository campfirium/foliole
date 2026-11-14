import { app } from 'electron';

import { APP_SETTINGS_STORAGE_KEYS } from '../src/shared/config/appSettings.js';

import { isDatabaseStartupPending } from './database/databaseReadiness.js';
import { loadJsonSetting } from './database/settingsStore.js';
import { appendMainProcessDiagnosticLog } from './diagnostics/mainProcessDiagnostics.js';

export function requestQuitOnMainWindowClose() {
  if (isDatabaseStartupPending()) return false;

  let settings: unknown;
  try {
    settings = loadJsonSetting('app_settings');
  } catch (error) {
    appendMainProcessDiagnosticLog('quit_on_window_close_setting_read_failed', { error });
    return false;
  }
  const key = APP_SETTINGS_STORAGE_KEYS.quitOnWindowClose;
  if (!settings || typeof settings !== 'object' || !(key in settings) || settings[key] !== 'true') return false;

  app.quit();
  return true;
}
