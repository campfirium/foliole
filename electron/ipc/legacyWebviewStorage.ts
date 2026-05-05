import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveAppPaths } from './paths.js';

const MIGRATION_MARKER_FILE = '.tauri-webview-storage-migrated';
const LEGACY_PROFILE_DIR_NAME = 'webview-main';

function toUniquePaths(paths: string[]) {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  if (!(await pathExists(dirPath))) {
    return true;
  }
  const entries = await fs.readdir(dirPath);
  return entries.length === 0;
}

export function resolveLegacyWebviewProfileCandidates(
  appDataDir = resolveAppPaths().app_data_dir,
  platform = process.platform,
  homeDir = os.homedir()
): string[] {
  const candidates: string[] = [];
  if (platform === 'win32') {
    const roamingAppData = path.dirname(appDataDir);
    const localAppDataFromRoaming = path.join(path.dirname(roamingAppData), 'Local');
    const roots = [localAppDataFromRoaming, path.join(homeDir, 'AppData', 'Local')];

    for (const root of roots) {
      candidates.push(path.join(root, 'Foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
      candidates.push(path.join(root, 'foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
      candidates.push(path.join(root, 'com', 'foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
      candidates.push(path.join(root, 'Foliole', LEGACY_PROFILE_DIR_NAME));
      candidates.push(path.join(root, 'foliole', LEGACY_PROFILE_DIR_NAME));
      candidates.push(path.join(root, 'com.foliole.desktop', LEGACY_PROFILE_DIR_NAME));
      candidates.push(path.join(root, 'com.foliole.desktop', 'EBWebView'));
    }
    return toUniquePaths(candidates);
  }

  if (platform === 'darwin') {
    const appSupport = path.join(homeDir, 'Library', 'Application Support');
    candidates.push(path.join(appSupport, 'Foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
    candidates.push(path.join(appSupport, 'foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
    candidates.push(path.join(appSupport, 'com', 'foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
    candidates.push(path.join(appSupport, 'com.foliole.desktop', LEGACY_PROFILE_DIR_NAME));
    candidates.push(path.join(appSupport, 'com.foliole.desktop', 'EBWebView'));
    return toUniquePaths(candidates);
  }

  const localShare = path.join(homeDir, '.local', 'share');
  candidates.push(path.join(localShare, 'Foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
  candidates.push(path.join(localShare, 'foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
  candidates.push(path.join(localShare, 'com', 'foliole', 'Foliole', 'data', LEGACY_PROFILE_DIR_NAME));
  candidates.push(path.join(localShare, 'com.foliole.desktop', LEGACY_PROFILE_DIR_NAME));
  candidates.push(path.join(localShare, 'com.foliole.desktop', 'EBWebView'));
  return toUniquePaths(candidates);
}

async function copyDirectoryIfSourceExists(sourceDir: string, targetDir: string): Promise<boolean> {
  if (!(await pathExists(sourceDir))) {
    return false;
  }
  if (!(await isDirectoryEmpty(targetDir))) {
    return false;
  }
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.cp(sourceDir, targetDir, { recursive: true });
  return true;
}

function resolveStorageBaseCandidates(profileDir: string) {
  return [profileDir, path.join(profileDir, 'Default')];
}

export async function migrateLegacyWebviewStorage(appDataDir = resolveAppPaths().app_data_dir): Promise<void> {
  const markerPath = path.join(appDataDir, MIGRATION_MARKER_FILE);
  if (await pathExists(markerPath)) {
    return;
  }

  const targetLocalStorageDir = path.join(appDataDir, 'Local Storage');
  const targetSessionStorageDir = path.join(appDataDir, 'Session Storage');

  const sourceProfiles = resolveLegacyWebviewProfileCandidates(appDataDir);
  for (const profileDir of sourceProfiles) {
    const storageBases = resolveStorageBaseCandidates(profileDir);
    for (const baseDir of storageBases) {
      const sourceLocalStorageDir = path.join(baseDir, 'Local Storage');
      const sourceSessionStorageDir = path.join(baseDir, 'Session Storage');
      const localStorageCopied = await copyDirectoryIfSourceExists(sourceLocalStorageDir, targetLocalStorageDir);
      const sessionStorageCopied = await copyDirectoryIfSourceExists(sourceSessionStorageDir, targetSessionStorageDir);

      if (localStorageCopied || sessionStorageCopied) {
        await fs.mkdir(appDataDir, { recursive: true });
        await fs.writeFile(markerPath, baseDir, 'utf8');
        return;
      }
    }
  }
}
