/* global console, process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const { repoRoot, userDataPath } = resolveWindowsNativePaths();
const localLibraryHome = 'D:\\X\\U\\Foliole';
const debugLibraryHome = path.join(userDataPath, 'native-debug-library');

function copyIfSourceIsNewer(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return false;
  }
  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
  if (targetStat && targetStat.mtimeMs >= sourceStat.mtimeMs && targetStat.size === sourceStat.size) {
    return false;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime);
  return true;
}

function resolveDebugLibraryHome() {
  const sourceDatabasePath = path.join(localLibraryHome, 'Data', 'foliole.db');
  const targetDatabasePath = path.join(debugLibraryHome, 'Data', 'foliole.db');
  if (copyIfSourceIsNewer(sourceDatabasePath, targetDatabasePath)) {
    console.info(`[electron-dev-native] refreshed debug database copy: ${targetDatabasePath}`);
  }
  return fs.existsSync(targetDatabasePath) ? debugLibraryHome : localLibraryHome;
}

function ensureLocalLibraryPathSettings(libraryHome) {
  const configDir = path.join(userDataPath, 'config');
  const settingsPath = path.join(configDir, 'library-path-settings.json');
  const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
  if (!fs.existsSync(databasePath)) {
    return;
  }
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify({
    assets_dir: null,
    inbox: null,
    library_home: libraryHome,
    mirror: null,
    updated_at: new Date().toISOString()
  }, null, 2)}\n`, 'utf8');
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
ensureLocalLibraryPathSettings(resolveDebugLibraryHome());

await import('../electron-dev.mjs');
