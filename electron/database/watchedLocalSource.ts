import { openDatabaseConnection } from './connection.js';
import type { DesktopSourceRecord } from './desktopSources.js';
import { loadDesktopDeviceId } from './deviceIdentity.js';

export function loadLocalWatchedSourceByRuleId(ruleId: string) {
  const localId = loadDesktopDeviceId();
  if (!localId) return null;
  return openDatabaseConnection().driver.queryOne<DesktopSourceRecord>(
    `SELECT s.source_ref, s.source_type, s.config_ref, s.host_name, s.host_platform,
      s.root_path, s.path_flavor, s.type_settings_json, s.updated_at
     FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
     WHERE b.deleted_at IS NULL AND b.owner_device_identity_key = ?
       AND (b.local_rule_id = ? OR b.binding_id = ?) LIMIT 1`,
    [localId, ruleId, ruleId]
  ) ?? null;
}

export function loadLocalWatchedRuleId(bindingId: string) {
  const localId = loadDesktopDeviceId();
  if (!localId) return null;
  return openDatabaseConnection().driver.queryOne<{ local_rule_id: string | null }>(
    `SELECT local_rule_id FROM watched_folder_bindings
     WHERE binding_id = ? AND owner_device_identity_key = ? AND deleted_at IS NULL`,
    [bindingId, localId]
  )?.local_rule_id ?? null;
}
