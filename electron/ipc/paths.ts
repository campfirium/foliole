import path from 'node:path';

import electron from 'electron';

const { app } = electron;

export interface AppPaths {
  app_data_dir: string;
  app_config_dir: string;
  app_cache_dir: string;
  app_log_dir: string;
}

export function resolveAppPaths(): AppPaths {
  const appDataDir = app.getPath('userData');
  return {
    app_data_dir: appDataDir,
    app_config_dir: path.join(appDataDir, 'config'),
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_log_dir: app.getPath('logs')
  };
}
