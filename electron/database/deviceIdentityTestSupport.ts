import { openDatabaseConnection } from './connection.js';

export function initializeDesktopDeviceProfileFixture(deviceId = 'desktop-fixture') {
  openDatabaseConnection().driver.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES ('device_id', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [JSON.stringify(deviceId), '2026-04-27T00:00:00.000Z']
  );
}
