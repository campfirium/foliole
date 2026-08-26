import type BetterSqlite3 from 'better-sqlite3';

import {
  prepareCopiedLibraryForDevice,
  type SyncDeviceCopyPreparationInput
} from '../../lib/core/database/syncDeviceCopyPreparation.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export function prepareDesktopCopiedLibraryForDevice(
  sqlite: BetterSqlite3.Database,
  input: SyncDeviceCopyPreparationInput
) {
  return prepareCopiedLibraryForDevice(
    createBetterSqliteDbPort(sqlite, { name: 'desktop-device-copy-preparation' }),
    input
  );
}
