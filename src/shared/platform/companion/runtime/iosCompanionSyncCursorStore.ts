import { ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS } from '../../../../../lib/core/database/androidCompanionSyncProtocolDefinitions';
import type { NativeSyncChangeCursor } from '../../../../../lib/platform/nativeSyncContract';

import { readIosCompanionDatabase, writeIosCompanionDatabase } from './iosCompanionActiveDatabase';

type CursorKey = keyof typeof ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaCursors;

export function loadIosCompanionNumberCursor(key: CursorKey) {
  return readCursor(key, (value) => {
    const cursor = Number(value);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_companion_number_cursor');
    return cursor;
  });
}

export function saveIosCompanionNumberCursor(key: CursorKey, cursor: number | null) {
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 0)) {
    throw new Error('invalid_companion_number_cursor');
  }
  return writeCursor(key, cursor === null ? null : String(cursor), cursor);
}

export function loadIosCompanionChangeCursor(key: CursorKey) {
  return readCursor<NativeSyncChangeCursor>(key, (value) => JSON.parse(value) as NativeSyncChangeCursor);
}

export function saveIosCompanionChangeCursor(key: CursorKey, cursor: NativeSyncChangeCursor | null) {
  return writeCursor(key, cursor === null ? null : JSON.stringify(cursor), cursor);
}

async function readCursor<T>(key: CursorKey, parse: (value: string) => T) {
  const rows = await readIosCompanionDatabase((db) => db.query<{ value: string }>(
    'SELECT value FROM companion_meta WHERE key = ? LIMIT 1', [cursorKey(key)]
  ));
  const value = rows[0]?.value;
  return value === undefined || value === null || value === '' ? null : parse(String(value));
}

async function writeCursor<T>(key: CursorKey, value: string | null, result: T) {
  await writeIosCompanionDatabase(async (db) => {
    if (value === null) return db.run('DELETE FROM companion_meta WHERE key = ?', [cursorKey(key)]);
    return db.run(
      `INSERT INTO companion_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [cursorKey(key), value, new Date().toISOString()]
    );
  });
  return result;
}

function cursorKey(key: CursorKey) {
  return ANDROID_COMPANION_SYNC_PROTOCOL_DEFINITIONS.syncMetaCursors[key];
}
