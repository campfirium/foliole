import fs from 'node:fs';
import path from 'node:path';

import {
  createEmptyLibraryPathOverrides,
  isLibraryPathLocation,
  normalizeLibraryPath,
  resolveLibraryPaths,
  type LibraryPathOverrides
} from '../../lib/platform/libraryPaths.js';
import { MANAGED_INBOX_APP_SETTING_KEY } from '../../lib/platform/managedInbox.js';
import type {
  NativeLibraryPathLocation,
  NativeLibraryPaths,
  NativeUpdateLibraryPathSettingArgs
} from '../../lib/platform/nativeUtilityContract.js';

import { migrateLibraryPathChange } from './libraryPathMigration.js';
import { resolveAppPaths } from './paths.js';
import { loadAppSettingsState } from './storage.js';

const LIBRARY_PATH_SETTINGS_FILE = 'library-path-settings.json';

interface StoredLibraryPathSettings {
  assets_dir?: unknown;
  inbox?: unknown;
  library_home?: unknown;
  mirror?: unknown;
  updated_at?: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredPathField(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isStoredTimestampField(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isStoredLibraryPathSettings(value: unknown): value is StoredLibraryPathSettings {
  return (
    isObjectRecord(value) &&
    isStoredPathField(value.assets_dir) &&
    isStoredPathField(value.inbox) &&
    isStoredPathField(value.library_home) &&
    isStoredPathField(value.mirror) &&
    isStoredTimestampField(value.updated_at)
  );
}

function resolveLibraryPathSettingsFilePath() {
  return path.join(resolveAppPaths().app_config_dir, LIBRARY_PATH_SETTINGS_FILE);
}

function normalizeStoredLibraryPathSettings(
  payload: StoredLibraryPathSettings | null,
  legacyManagedInboxPath?: string | null
): LibraryPathOverrides {
  const fallback = createEmptyLibraryPathOverrides();
  return {
    assets_dir: normalizeLibraryPath(payload?.assets_dir),
    inbox: normalizeLibraryPath(payload?.inbox) ?? normalizeLibraryPath(legacyManagedInboxPath) ?? fallback.inbox,
    library_home: normalizeLibraryPath(payload?.library_home),
    mirror: normalizeLibraryPath(payload?.mirror),
    updated_at:
      typeof payload?.updated_at === 'string' && payload.updated_at.trim().length > 0
        ? payload.updated_at
        : fallback.updated_at
  };
}

function readStoredLibraryPathSettings() {
  const settingsPath = resolveLibraryPathSettingsFilePath();
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isStoredLibraryPathSettings(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function loadStoredLibraryPathOverrides() {
  const settings = readStoredLibraryPathSettings();
  const shouldReadLegacyInbox = !normalizeLibraryPath(settings?.inbox);
  const legacyManagedInboxPath = shouldReadLegacyInbox
    ? ((await loadAppSettingsState())[MANAGED_INBOX_APP_SETTING_KEY] ?? null)
    : null;
  return normalizeStoredLibraryPathSettings(settings, legacyManagedInboxPath);
}

function saveStoredLibraryPathOverrides(overrides: LibraryPathOverrides) {
  const settingsPath = resolveLibraryPathSettingsFilePath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(overrides, null, 2));
}

function resolveDocumentsPathFallback() {
  const appPaths = resolveAppPaths();
  return normalizeLibraryPath(appPaths.documents_dir) ?? appPaths.app_data_dir;
}

function toNativeLibraryPaths(overrides: LibraryPathOverrides): NativeLibraryPaths {
  return resolveLibraryPaths(resolveDocumentsPathFallback(), overrides);
}

function loadStoredLibraryPathOverridesSync() {
  return normalizeStoredLibraryPathSettings(readStoredLibraryPathSettings(), null);
}

export function loadLibraryPathSettingsSync(): NativeLibraryPaths {
  return toNativeLibraryPaths(loadStoredLibraryPathOverridesSync());
}

export function ensureLibraryPathLayout(paths = loadLibraryPathSettingsSync()) {
  fs.mkdirSync(paths.data_dir, { recursive: true });
  fs.mkdirSync(paths.assets_dir, { recursive: true });
  fs.mkdirSync(paths.inbox, { recursive: true });
  fs.mkdirSync(paths.mirror, { recursive: true });
}

function normalizeUpdatedLibraryPath(args: NativeUpdateLibraryPathSettingArgs): string | null {
  if (!isLibraryPathLocation(args.location)) {
    throw new Error(`unknown library path location: ${String(args.location)}`);
  }
  if (args.path === null) {
    return null;
  }
  const normalizedPath = normalizeLibraryPath(args.path);
  if (!normalizedPath) {
    throw new Error(`library path must be an absolute path: ${args.location}`);
  }
  return normalizedPath;
}

export async function loadLibraryPathSettings(): Promise<NativeLibraryPaths> {
  return toNativeLibraryPaths(await loadStoredLibraryPathOverrides());
}

export async function updateLibraryPathSetting(
  args: NativeUpdateLibraryPathSettingArgs
): Promise<NativeLibraryPaths> {
  const currentOverrides = await loadStoredLibraryPathOverrides();
  const location = args.location as NativeLibraryPathLocation;
  const nextOverrides: LibraryPathOverrides = {
    ...currentOverrides,
    [location]: normalizeUpdatedLibraryPath(args),
    updated_at: new Date().toISOString()
  };
  const currentPaths = toNativeLibraryPaths(currentOverrides);
  const nextPaths = toNativeLibraryPaths(nextOverrides);
  await migrateLibraryPathChange({
    currentOverrides,
    currentPaths,
    location,
    nextOverrides,
    nextPaths
  });
  saveStoredLibraryPathOverrides(nextOverrides);
  ensureLibraryPathLayout(nextPaths);
  return nextPaths;
}

export function resolveLibraryPathSettingsFileForTest() {
  return resolveLibraryPathSettingsFilePath();
}
