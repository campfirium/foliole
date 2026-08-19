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
  const currentHostName = await readDesktopHostName(port);
  if (!canMaterializeDesktopSetting(identity, currentHostName)) return;
  if (record.deleted_at) {
    await port.run('DELETE FROM settings WHERE key = ?', [identity.key]);
    return;
  }
  const row = (await port.query<SettingValueRow>(
    `SELECT value_json, updated_at FROM setting_records
     WHERE scope = ? AND platform = ? AND form_factor = ? AND host_name = ? AND key = ?`,
    [identity.scope, identity.platform, identity.formFactor, identity.hostName, identity.key]
  ))[0];
  if (!row) return;
  await port.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [identity.key, row.value_json, row.updated_at]
  );
}

function parseSettingIdentity(objectId: string): Omit<DesktopSettingIdentity, 'objectId'> | null {
  const [scope, platform, formFactor, hostName, key] = objectId.split(':', 5);
  if (!scope || !platform || !formFactor || !hostName || !key) return null;
  if (scope !== 'host' && scope !== 'session_resume' && scope !== 'user_space') return null;
  return { formFactor, hostName, key, platform, scope };
}

async function readDesktopHostName(port: DbPort) {
  const row = (await port.query<StoredSettingRow>(
    "SELECT value FROM settings WHERE key = 'host_name' LIMIT 1"
  ))[0];
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return row.value.trim() || null;
  }
}
