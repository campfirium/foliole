import { app, safeStorage } from 'electron';

import {
  loadMacosSecurityScopedBookmarkAdapter,
  type MacosSecurityScopedBookmarkAdapter
} from '../macosSecurityScopedBookmarksNative.js';

export class LegacyPairingStoreMigrationError extends Error {
  constructor(readonly code: string) {
    super(`Legacy macOS paired-device migration failed: ${code}`);
    this.name = 'LegacyPairingStoreMigrationError';
  }
}

interface MigrationRuntime {
  adapter?: MacosSecurityScopedBookmarkAdapter;
  encryptString?: (plaintext: string) => Buffer;
  isMas?: boolean;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
}

function resolveAdapter(runtime: MigrationRuntime) {
  if (runtime.adapter) return runtime.adapter;
  const loaded = loadMacosSecurityScopedBookmarkAdapter();
  if (loaded.status !== 'ready') throw new LegacyPairingStoreMigrationError(loaded.status);
  return loaded.adapter;
}

export function migrateLegacyMacosPairingCiphertext(
  encrypted: Buffer,
  runtime: MigrationRuntime = {}
): { encrypted: Buffer; plaintext: string } | null {
  const platform = runtime.platform ?? process.platform;
  const isPackaged = runtime.isPackaged ?? app.isPackaged;
  const isMas = runtime.isMas ?? process.mas === true;
  if (platform !== 'darwin' || !isPackaged || isMas) return null;

  const result = resolveAdapter(runtime).decryptLegacyMasSafeStorage(encrypted);
  if (!result.ok) throw new LegacyPairingStoreMigrationError(result.errorCode);
  const encryptString = runtime.encryptString ?? safeStorage.encryptString.bind(safeStorage);
  return { encrypted: encryptString(result.plaintext), plaintext: result.plaintext };
}
