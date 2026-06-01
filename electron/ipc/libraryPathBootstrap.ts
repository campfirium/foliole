import fs from 'node:fs';
import path from 'node:path';

import {
  createEmptyLibraryPathOverrides,
  normalizeLibraryPath,
  resolveLibraryPaths,
  type LibraryPathOverrides
} from '../../lib/platform/libraryPaths.js';

import { resolveAppPaths } from './paths.js';

const CURRENT_LIBRARY_FILE = 'current-library.json';
const LEGACY_LIBRARY_PATH_SETTINGS_FILE = 'library-path-settings.json';

interface StoredCurrentLibrary {
  library_home?: unknown;
  updated_at?: unknown;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function resolveConfigFile(fileName: string) {
  return path.join(resolveAppPaths().app_config_dir, fileName);
}

export function resolveExplicitLibraryHome(env: NodeJS.ProcessEnv = process.env) {
  return normalizeLibraryPath(env.FOLIOLE_LIBRARY_HOME);
}

export function readLegacyLibraryPathOverrides(): LibraryPathOverrides | null {
  const payload = readJsonFile(resolveConfigFile(LEGACY_LIBRARY_PATH_SETTINGS_FILE));
  if (!payload) {
    return null;
  }
  return {
    ...createEmptyLibraryPathOverrides(),
    assets_dir: normalizeLibraryPath(payload.assets_dir),
    inbox: normalizeLibraryPath(payload.inbox),
    library_home: normalizeLibraryPath(payload.library_home),
    mirror: normalizeLibraryPath(payload.mirror),
    updated_at:
      typeof payload.updated_at === 'string' && payload.updated_at.trim()
        ? payload.updated_at
        : createEmptyLibraryPathOverrides().updated_at
  };
}

function readCurrentLibraryHome() {
  const payload = readJsonFile(resolveConfigFile(CURRENT_LIBRARY_FILE)) as StoredCurrentLibrary | null;
  return normalizeLibraryPath(payload?.library_home);
}

function resolveDocumentsPathFallback() {
  const appPaths = resolveAppPaths();
  return normalizeLibraryPath(appPaths.documents_dir) ?? appPaths.app_data_dir;
}

export function resolveBootstrapLibraryHome(env: NodeJS.ProcessEnv = process.env) {
  return (
    resolveExplicitLibraryHome(env) ??
    readCurrentLibraryHome() ??
    readLegacyLibraryPathOverrides()?.library_home ??
    null
  );
}

export function resolveBootstrapLibraryPaths(env: NodeJS.ProcessEnv = process.env) {
  return resolveLibraryPaths(resolveDocumentsPathFallback(), {
    library_home: resolveBootstrapLibraryHome(env)
  });
}

export function saveCurrentLibraryHome(libraryHome: string) {
  const currentLibraryPath = resolveConfigFile(CURRENT_LIBRARY_FILE);
  fs.mkdirSync(path.dirname(currentLibraryPath), { recursive: true });
  fs.writeFileSync(
    currentLibraryPath,
    JSON.stringify({ library_home: libraryHome, updated_at: new Date().toISOString() }, null, 2)
  );
}
