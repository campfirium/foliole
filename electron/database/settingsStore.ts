import type { DatabaseRow } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';
import { writeSettingRecord } from './settingRecords.js';

interface SettingsRow extends DatabaseRow {
  value: string;
}

export function loadJsonSetting(settingKey: string): unknown | null {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<SettingsRow>('SELECT value FROM settings WHERE key = ?', [
    settingKey
  ]);
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
  connection.driver.transaction((driver) => {
    writeJsonSetting(driver, settingKey, payload, updatedAt);
  });
}

export function writeJsonSetting(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  settingKey: string,
  payload: unknown,
  updatedAt = new Date().toISOString()
) {
  const valueJson = JSON.stringify(payload);
  writeSettingRecord(driver, { key: settingKey, updatedAt, valueJson });
  driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [settingKey, valueJson, updatedAt]
  );
}
