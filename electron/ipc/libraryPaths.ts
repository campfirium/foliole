import fs from 'node:fs';

import {
  createEmptyLibraryPathOverrides,
  isLibraryPathLocation,
  normalizeLibraryPath,
  resolveLibraryPaths,
  type LibraryPathOverrides
} from '../../lib/platform/libraryPaths.js';
import { MANAGED_INBOX_APP_SETTING_KEY } from '../../lib/platform/managedInbox.js';
import type {
  NativeLibraryPaths,
  NativeUpdateLibraryPathSettingArgs
} from '../../lib/platform/nativeUtilityContract.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { assertNoUnsafePathOverlap } from '../libraryPathSafety.js';

import {
  readLegacyLibraryPathOverrides,
  resolveBootstrapLibraryHome,
  resolveBootstrapLibraryPaths,
  resolveExplicitLibraryHome,
  saveCurrentLibraryHome
} from './libraryPathBootstrap.js';
import { migrateLibraryPathChange } from './libraryPathMigration.js';
import { loadAppSettingsState } from './storage.js';

const LIBRARY_PATH_SETTINGS_KEY = 'library_path_settings';

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

function normalizeStoredLibraryPathSettings(
  payload: StoredLibraryPathSettings | null,
  legacyManagedInboxPath?: string | null
): LibraryPathOverrides {
  const fallback = createEmptyLibraryPathOverrides();
  return {
    assets_dir: normalizeLibraryPath(payload?.assets_dir),
    inbox: normalizeLibraryPath(payload?.inbox) ?? normalizeLibraryPath(legacyManagedInboxPath) ?? fallback.inbox,
    library_home: null,
    mirror: normalizeLibraryPath(payload?.mirror),
    updated_at:
      typeof payload?.updated_at === 'string' && payload.updated_at.trim().length > 0
        ? payload.updated_at
        : fallback.updated_at
  };
}

function readStoredLibraryPathSettings() {
  const parsed = loadJsonSetting(LIBRARY_PATH_SETTINGS_KEY);
  return isStoredLibraryPathSettings(parsed) ? parsed : null;
}

async function loadStoredLibraryPathOverrides() {
  const settings = readStoredLibraryPathSettings() ?? readLegacyLibraryPathOverrides();
  const shouldReadLegacyInbox = !normalizeLibraryPath(settings?.inbox);
  const legacyManagedInboxPath = shouldReadLegacyInbox
    ? ((await loadAppSettingsState())[MANAGED_INBOX_APP_SETTING_KEY] ?? null)
    : null;
  return normalizeStoredLibraryPathSettings(settings, legacyManagedInboxPath);
}

function saveStoredLibraryPathOverrides(overrides: LibraryPathOverrides) {
  saveJsonSetting(LIBRARY_PATH_SETTINGS_KEY, overrides, overrides.updated_at);
}

function toNativeLibraryPaths(overrides: LibraryPathOverrides): NativeLibraryPaths {
  const bootstrapLibraryHome = resolveBootstrapLibraryPaths().library_home;
  return resolveLibraryPaths(bootstrapLibraryHome, {
    ...overrides,
    library_home: normalizeLibraryPath(overrides.library_home) ?? resolveBootstrapLibraryHome() ?? bootstrapLibraryHome
  });
}

function loadStoredLibraryPathOverridesSync() {
  return normalizeStoredLibraryPathSettings(
    readStoredLibraryPathSettings() ?? readLegacyLibraryPathOverrides(),
    null
  );
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

function assertSafeLibraryPathLayout(paths: NativeLibraryPaths) {
  assertNoUnsafePathOverlap([
    { label: 'Assets', path: paths.assets_dir },
    { label: 'Data', path: paths.data_dir },
    { label: 'Inbox', path: paths.inbox },
    { label: 'Mirror', path: paths.mirror }
  ]);
}

export async function loadLibraryPathSettings(): Promise<NativeLibraryPaths> {
  return toNativeLibraryPaths(await loadStoredLibraryPathOverrides());
}

export async function updateLibraryPathSetting(
  args: NativeUpdateLibraryPathSettingArgs
): Promise<NativeLibraryPaths> {
  if (args.location !== 'library_home' && resolveExplicitLibraryHome()) {
    throw new Error('library path overrides are disabled for explicit --library-home launches');
  }
  const currentOverrides = await loadStoredLibraryPathOverrides();
  const location = args.location;
  const nextOverrides: LibraryPathOverrides = {
    ...currentOverrides,
    ...(location === 'library_home' ? {} : { [location]: normalizeUpdatedLibraryPath(args) }),
    updated_at: new Date().toISOString()
  };
  const migrationNextOverrides =
    location === 'library_home'
      ? { ...nextOverrides, library_home: normalizeUpdatedLibraryPath(args) }
      : nextOverrides;
  const currentPaths = toNativeLibraryPaths(currentOverrides);
  const nextPaths = toNativeLibraryPaths(migrationNextOverrides);
  assertSafeLibraryPathLayout(nextPaths);
  await migrateLibraryPathChange({
    currentOverrides,
    currentPaths,
    ...(args.confirm_existing_library_home === true ? { confirmExistingLibraryHome: true } : {}),
    location,
    nextOverrides: migrationNextOverrides,
    nextPaths
  });
  if (location === 'library_home') {
    saveCurrentLibraryHome(nextPaths.library_home);
  } else {
    saveStoredLibraryPathOverrides(nextOverrides);
  }
  ensureLibraryPathLayout(nextPaths);
  return nextPaths;
}
