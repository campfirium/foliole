import { openDatabaseConnection } from './connection.js';

interface SettingsRow {
  value: string;
}

export function loadJsonSetting(settingKey: string): unknown | null {
  const connection = openDatabaseConnection();
  const row = connection.sqlite
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(settingKey) as SettingsRow | undefined;
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

export function saveJsonSetting(settingKey: string, payload: unknown, updatedAt = new Date().toISOString()): void {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .run(settingKey, JSON.stringify(payload), updatedAt);
}
