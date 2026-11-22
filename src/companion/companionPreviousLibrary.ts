import { getCompanionBackupRestorePort } from '../shared/platform/companion/backupRestore/companionBackupRestoreRuntimeRepository';

/** The library a restore set aside on this phone. Only one is kept; the next swap deletes it. */
export type CompanionPreviousLibrary = { savedAt: string; bytes: number };

/** Reads the set-aside library, or null while none is kept (or it cannot be read). */
export async function readCompanionPreviousLibrary(): Promise<CompanionPreviousLibrary | null> {
  try {
    const value = await getCompanionBackupRestorePort().previous();
    return value.exists ? { savedAt: value.savedAt ?? '', bytes: value.bytes ?? 0 } : null;
  } catch {
    return null;
  }
}

/** Rounded-up megabytes, at least 1 MB, for "frees about …" and "about … will be deleted". */
export function formatCompanionLibrarySize(bytes: number) {
  return `${Math.max(1, Math.ceil(bytes / (1024 * 1024)))} MB`;
}
