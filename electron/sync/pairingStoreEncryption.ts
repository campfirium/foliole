import { safeStorage } from 'electron';

import {
  LegacyPairingStoreMigrationError,
  migrateLegacyMacosPairingCiphertext
} from './macosLegacyPairingStoreMigration.js';
import { persistMigratedPairingStore } from './pairingStoreMigrationPersistence.js';

export class PairingStoreDecryptionError extends Error {
  constructor(
    override readonly cause: unknown,
    readonly storePath: string,
    readonly preserveStore = false
  ) {
    super('Companion paired-device store is unreadable.');
    this.name = 'PairingStoreDecryptionError';
  }
}

function persistMigration(encrypted: Buffer, storePath: string, plaintext: string, replacement: Buffer) {
  const parsed = JSON.parse(plaintext) as unknown;
  const backupPath = persistMigratedPairingStore({ encrypted: replacement, original: encrypted, storePath });
  console.info('[companion-sync] migrated legacy macOS paired-device encryption', { backupPath });
  return parsed;
}

export function readEncryptedPairingStorePayload(encrypted: Buffer, storePath: string) {
  try {
    return JSON.parse(safeStorage.decryptString(encrypted)) as unknown;
  } catch (decryptionError) {
    let migrationStarted = false;
    try {
      const migrated = migrateLegacyMacosPairingCiphertext(encrypted);
      if (!migrated) throw decryptionError;
      migrationStarted = true;
      return persistMigration(encrypted, storePath, migrated.plaintext, migrated.encrypted);
    } catch (error) {
      throw new PairingStoreDecryptionError(
        error, storePath, migrationStarted || error instanceof LegacyPairingStoreMigrationError
      );
    }
  }
}
