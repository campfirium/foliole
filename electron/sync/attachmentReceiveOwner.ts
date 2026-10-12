import { realpathSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

export type AttachmentReceiveOwner =
  | { kind: 'busy' }
  | { kind: 'acquired'; close(): void };

/** A permanent empty lock carrier. Never unlink it or use the library database here. */
export function tryAcquireAttachmentReceiveOwner(libraryRoot: string): AttachmentReceiveOwner {
  const file = path.join(realpathSync(libraryRoot), '.attachment-receiver.lock');
  const connection = new Database(file, { timeout: 0 });
  try {
    connection.pragma('locking_mode = EXCLUSIVE');
    connection.exec('BEGIN EXCLUSIVE');
    return { kind: 'acquired', close() {
      if (connection.open) connection.close();
    } };
  } catch (error) {
    connection.close();
    if (error instanceof Database.SqliteError && error.code === 'SQLITE_BUSY') return { kind: 'busy' };
    throw error;
  }
}
