import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadDatabaseDeviceId } from '../../lib/core/database/syncDeviceIdentity.js';

import { writeJsonSetting } from './settingsStore.js';

const MIGRATION_KEY = 'readwise_source_identity_initialized';

export function readwiseSourceOwner(settingsJson: string): string | null {
  const settings: unknown = JSON.parse(settingsJson);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const owner = 'ownerDeviceIdentityKey' in settings ? settings.ownerDeviceIdentityKey : null;
  return typeof owner === 'string' && owner.trim() ? owner : null;
}

export function migrateReadwiseSourceIdentity(driver: DatabaseDriver, previousName: string, now: string) {
  if (driver.queryOne('SELECT 1 AS present FROM settings WHERE key = ?', [MIGRATION_KEY])) return;
  const localId = loadDatabaseDeviceId(driver);
  const names = driver.queryAll<{ device_identity_key: string }>(`SELECT d.device_identity_key
    FROM sync_group_devices d JOIN sync_group_local_state l ON l.group_id = d.group_id
    WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active' AND d.device_name = ?`, [previousName]);
  const unambiguous = names.length === 0 || (names.length === 1 && names[0]?.device_identity_key === localId);
  driver.transaction(tx => {
    tx.execute(`UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json,
      '$.ownerDeviceIdentityKey', CASE WHEN host_name = ? AND ? THEN ? ELSE NULL END)
      WHERE source_type = 'readwise' AND json_valid(type_settings_json)
        AND json_type(type_settings_json, '$.ownerDeviceIdentityKey') IS NULL`,
    [previousName, unambiguous ? 1 : 0, localId]);
    if (!tx.queryOne("SELECT 1 AS present FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'")) {
      const owner = tx.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'readwise_active_host' AND json_valid(value)");
      if (owner) {
        const value: unknown = JSON.parse(owner.value);
        if (value && typeof value === 'object' && !Array.isArray(value) &&
            !('device_identity_key' in value) && 'host_name' in value && value.host_name === previousName) {
          writeJsonSetting(tx, 'readwise_active_host', {
            ...value, device_identity_key: localId, epoch: 'epoch' in value ? value.epoch : 0
          }, now);
        }
      }
    }
    tx.execute('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [MIGRATION_KEY, 'true', now]);
  });
}

export function retagStandaloneReadwiseOwner(driver: DatabaseDriver, previousId: string | null,
  nextId: string, now: string) {
  if (!previousId || previousId === nextId) return;
  const row = driver.queryOne<{ value: string }>(`SELECT value FROM settings
    WHERE key = 'readwise_active_host' AND json_valid(value)
      AND json_extract(value, '$.device_identity_key') = ?`, [previousId]);
  if (row) writeJsonSetting(driver, 'readwise_active_host',
    { ...JSON.parse(row.value), device_identity_key: nextId }, now);
}

export function retagLocalReadwiseSources(driver: DatabaseDriver, previousId: string | null,
  nextId: string, now: string) {
  if (!previousId || previousId === nextId) return;
  driver.execute(`UPDATE desktop_sources SET type_settings_json = json_set(type_settings_json,
    '$.ownerDeviceIdentityKey', ?), updated_at = ? WHERE source_type = 'readwise'
      AND json_valid(type_settings_json) AND json_extract(type_settings_json, '$.ownerDeviceIdentityKey') = ?`,
  [nextId, now, previousId]);
}
