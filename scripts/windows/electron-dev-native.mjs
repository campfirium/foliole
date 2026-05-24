/* global process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const { repoRoot, userDataPath } = resolveWindowsNativePaths();
const localLibraryHome = 'D:\\X\\U\\Foliole';

function ensureLocalLibraryPathSettings() {
  const configDir = path.join(userDataPath, 'config');
  const settingsPath = path.join(configDir, 'library-path-settings.json');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify({
    assets_dir: null,
    inbox: null,
    library_home: localLibraryHome,
    mirror: null,
    updated_at: new Date().toISOString()
  }, null, 2)}\n`, 'utf8');
}

function assertLocalDatabaseWritable() {
  const databasePath = path.join(localLibraryHome, 'Data', 'foliole.db');
  let handle = null;
  try {
    handle = fs.openSync(databasePath, 'r+');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`native preview process cannot open the live database for write from this launch context: ${databasePath}; detail=${detail}`);
  } finally {
    if (handle !== null) {
      fs.closeSync(handle);
    }
  }
}

process.env.FOLIOLE_USER_DATA_PATH = userDataPath;
process.env.FOLIOLE_SESSION_DATA_PATH = userDataPath;
process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`;
process.env.FOLIOLE_DISABLE_IN_APP_RELAUNCH ??= '1';
process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE ??= path.join(repoRoot, '.windows-dev-shell-restart-request.json');
process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION ??= '1';
process.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_INTEGRITY_CHECK ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_NODE_SYNC_FLUSH ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_SCHEMA_INIT ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_WAL_ENABLE ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_WINDOW_STATE ??= '1';
ensureLocalLibraryPathSettings();
assertLocalDatabaseWritable();

await import('../electron-dev.mjs');
