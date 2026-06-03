/* global process */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveWindowsNativePaths } from './windows-native-paths.mjs';

const { repoRoot, userDataPath: defaultUserDataPath } = resolveWindowsNativePaths();
const mainLibraryHome = 'D:\\X\\U\\Foliole';
const sandboxLibraryHome = path.join(repoRoot, '.tmp', 'preview-sandbox-library');
const isSandboxPreview = process.env.FOLIOLE_NATIVE_PREVIEW_SANDBOX === '1';
const localLibraryHome = process.env.FOLIOLE_NATIVE_LIBRARY_HOME?.trim() ||
  (isSandboxPreview ? sandboxLibraryHome : mainLibraryHome);
const userDataPath = process.env.FOLIOLE_NATIVE_USER_DATA_PATH?.trim() ||
  (isSandboxPreview ? path.join(repoRoot, '.tmp', 'electron-user-data-sandbox') : defaultUserDataPath);

function assertSandboxPath(value, label) {
  if (!isSandboxPreview) return;
  const normalized = path.resolve(value);
  if (normalized === path.resolve(mainLibraryHome) || normalized === path.resolve(defaultUserDataPath)) {
    throw new Error(`refusing sandbox reset for protected ${label}: ${value}`);
  }
}

function resetSandboxState() {
  if (!isSandboxPreview || process.env.FOLIOLE_NATIVE_PREVIEW_RESET !== '1') return;
  assertSandboxPath(localLibraryHome, 'library home');
  assertSandboxPath(userDataPath, 'user data');
  fs.rmSync(localLibraryHome, { force: true, recursive: true });
  fs.rmSync(userDataPath, { force: true, recursive: true });
}

function assertLocalDatabaseWritable() {
  const databasePath = path.join(localLibraryHome, 'Data', 'foliole.db');
  const useTemporaryLibrary = process.env.FOLIOLE_NATIVE_PREVIEW_TEMP_LIBRARY === '1';
  let handle = null;
  try {
    if (useTemporaryLibrary) {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    handle = fs.openSync(databasePath, useTemporaryLibrary ? 'a+' : 'r+');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`native preview process cannot open the live database for write from this launch context: ${databasePath}; detail=${detail}`);
  } finally {
    if (handle !== null) {
      fs.closeSync(handle);
    }
  }
}

resetSandboxState();
process.env.FOLIOLE_USER_DATA_PATH = userDataPath;
process.env.FOLIOLE_SESSION_DATA_PATH = userDataPath;
process.env.FOLIOLE_LIBRARY_HOME = localLibraryHome;
if (process.env.FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE?.trim()) {
  process.env.FOLIOLE_GUIDED_SAMPLE_LOCALE = process.env.FOLIOLE_NATIVE_GUIDED_SAMPLE_LOCALE.trim();
}
process.env.FOLIOLE_WORKDIR ??= repoRoot;
process.env.FOLIOLE_BOOT_SESSION ??= `windows-native-${randomUUID()}`;
process.env.FOLIOLE_DISABLE_IN_APP_RELAUNCH ??= '1';
process.env.FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE ??= path.join(repoRoot, '.windows-dev-shell-restart-request.json');
process.env.FOLIOLE_DISABLE_HARDWARE_ACCELERATION ??= '1';
process.env.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_INTEGRITY_CHECK ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_NODE_SYNC_FLUSH ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_WAL_ENABLE ??= '1';
process.env.FOLIOLE_SKIP_STARTUP_WINDOW_STATE ??= '1';
assertLocalDatabaseWritable();

await import('../electron-dev.mjs');
