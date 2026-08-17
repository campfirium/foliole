import type { DbPort } from './dbPort.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

export async function applySettingObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  const parts = record.object_id.split(':', 5);
  if (record.deleted_at) {
    await port.run(
      `DELETE FROM setting_records WHERE scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?`,
      [parts[0] ?? 'device', parts[1] ?? '*', parts[2] ?? '*', parts[3] ?? '*', parts[4] ?? record.object_id]
    );
    return;
  }
  const payload = asObject(record);
  const key = text(payload.key) ?? parts[4] ?? record.object_id;
  await port.run(
    `INSERT INTO setting_records (scope, platform, form_factor, device_id, key, value_json, content_hash, updated_at, deleted_at) ` +
    `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(key, scope, platform, form_factor, device_id) DO UPDATE SET ` +
    `value_json = excluded.value_json, content_hash = excluded.content_hash, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [text(payload.scope) ?? parts[0] ?? 'device', text(payload.platform) ?? parts[1] ?? '*',
      text(payload.form_factor) ?? parts[2] ?? '*', text(payload.device_id) ?? parts[3] ?? '*', key,
      stripLegacyWatchedSources(key, text(payload.value_json) ?? 'null'), record.content_hash, record.updated_at, null]
  );
}

export function stripLegacyWatchedSources(key: string, valueJson: string) {
  if (key !== 'import_manager_settings') return valueJson;
  try {
    const parsed = JSON.parse(valueJson) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return valueJson;
    const sanitized = { ...parsed as Record<string, unknown> };
    delete sanitized.sources;
    return JSON.stringify(sanitized);
  } catch {
    return valueJson;
  }
}
