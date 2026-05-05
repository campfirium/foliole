import path from 'node:path';

export const LIBRARY_HOME_DEFAULT_DIRNAME = 'Foliole';
export const LIBRARY_DATA_DIRNAME = 'Data';
export const LIBRARY_DATABASE_FILENAME = 'foliole.db';
export const LIBRARY_ASSETS_DIRNAME = 'Assets';
export const LIBRARY_INBOX_DIRNAME = 'Inbox';
export const LIBRARY_MIRROR_DIRNAME = 'Mirror';

export const LIBRARY_PATH_LOCATIONS = ['library_home', 'assets_dir', 'inbox', 'mirror'] as const;

export type LibraryPathLocation = (typeof LIBRARY_PATH_LOCATIONS)[number];

export interface LibraryPathOverrides {
  assets_dir: string | null;
  inbox: string | null;
  library_home: string | null;
  mirror: string | null;
  updated_at: string;
}

export interface ResolvedLibraryPaths {
  assets_dir: string;
  data_dir: string;
  database_path: string;
  inbox: string;
  library_home: string;
  mirror: string;
  updated_at: string;
}

const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z';

export function normalizeLibraryPath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    return null;
  }
  return path.normalize(trimmed);
}

export function createEmptyLibraryPathOverrides(): LibraryPathOverrides {
  return {
    assets_dir: null,
    inbox: null,
    library_home: null,
    mirror: null,
    updated_at: DEFAULT_UPDATED_AT
  };
}

export function resolveDefaultLibraryHome(documentsPath: string) {
  return path.join(documentsPath, LIBRARY_HOME_DEFAULT_DIRNAME);
}

export function resolveLibraryPaths(
  documentsPath: string,
  overrides: Partial<LibraryPathOverrides> = {}
): ResolvedLibraryPaths {
  const libraryHome = normalizeLibraryPath(overrides.library_home) ?? resolveDefaultLibraryHome(documentsPath);
  const assetsDir = normalizeLibraryPath(overrides.assets_dir) ?? path.join(libraryHome, LIBRARY_ASSETS_DIRNAME);
  const inbox = normalizeLibraryPath(overrides.inbox) ?? path.join(libraryHome, LIBRARY_INBOX_DIRNAME);
  const mirror = normalizeLibraryPath(overrides.mirror) ?? path.join(libraryHome, LIBRARY_MIRROR_DIRNAME);
  const dataDir = path.join(libraryHome, LIBRARY_DATA_DIRNAME);
  return {
    assets_dir: assetsDir,
    data_dir: dataDir,
    database_path: path.join(dataDir, LIBRARY_DATABASE_FILENAME),
    inbox,
    library_home: libraryHome,
    mirror,
    updated_at:
      typeof overrides.updated_at === 'string' && overrides.updated_at.trim().length > 0
        ? overrides.updated_at
        : DEFAULT_UPDATED_AT
  };
}

export function isLibraryPathLocation(value: unknown): value is LibraryPathLocation {
  return typeof value === 'string' && LIBRARY_PATH_LOCATIONS.includes(value as LibraryPathLocation);
}
