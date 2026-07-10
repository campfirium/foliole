import {
  canMaterializeDesktopSetting,
  type DesktopSettingIdentity
} from '../../lib/core/database/desktopSettingPolicy.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { SyncPackSyncObjectRecord } from '../../lib/core/sync/syncPackSyncObjectsExecutor.js';

interface SettingValueRow extends DbRow {
  updated_at: string;
  value_json: string;
}

interface StoredSettingRow extends DbRow {
  value: string;
}

export async function materializeDesktopSettingRecord(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.object_type !== 'setting') return;
  const identity = parseSettingIdentity(record.object_id);
  if (!identity) return;
  const currentDeviceId = await readDesktopDeviceId(port);
  if (!canMaterializeDesktopSetting(identity, currentDeviceId)) return;
  if (record.deleted_at) {
    await port.run('DELETE FROM settings WHERE key = ?', [identity.key]);
    return;
  }
  const row = (await port.query<SettingValueRow>(
    `SELECT value_json, updated_at FROM setting_records
     WHERE scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?`,
    [identity.scope, identity.platform, identity.formFactor, identity.deviceId, identity.key]
  ))[0];
  if (!row) return;
  await port.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [identity.key, row.value_json, row.updated_at]
  );
}

function parseSettingIdentity(objectId: string): Omit<DesktopSettingIdentity, 'objectId'> | null {
  const [scope, platform, formFactor, deviceId, key] = objectId.split(':', 5);
  if (!scope || !platform || !formFactor || !deviceId || !key) return null;
  if (scope !== 'device' && scope !== 'session_resume' && scope !== 'user_space') return null;
  return { deviceId, formFactor, key, platform, scope };
}

async function readDesktopDeviceId(port: DbPort) {
  for (const key of ['device_id', 'desktop_device_id']) {
    const row = (await port.query<StoredSettingRow>('SELECT value FROM settings WHERE key = ?', [key]))[0];
    if (!row) continue;
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch {
      if (row.value.trim()) return row.value.trim();
    }
  }
  return null;
}
