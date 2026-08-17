import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import {
  CURRENT_SYNC_ADVERTISED_FEATURES,
  normalizeSyncAdvertisedFeatures
} from '../../lib/platform/syncAdvertisedFeatures.js';

interface MemberGenerationRow extends DatabaseRow {
  authorization_id: string;
  joined_at: string;
}

export function recordLocalSyncGroupFeatures(driver: DatabaseDriver, deviceId: string) {
  return recordMemberFeatures(driver, deviceId, CURRENT_SYNC_ADVERTISED_FEATURES);
}

export function recordObservedSyncGroupFeatures(
  driver: DatabaseDriver,
  deviceId: string,
  features: unknown
) {
  return recordMemberFeatures(driver, deviceId, features);
}

function recordMemberFeatures(driver: DatabaseDriver, deviceId: string, features: unknown) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) return false;
  const member = driver.queryOne<MemberGenerationRow>(
    `SELECT authorization_id, joined_at FROM sync_group_members
     WHERE device_id = ? AND state = 'active' LIMIT 1`,
    [normalizedDeviceId]
  );
  if (!member) return false;
  const value = JSON.stringify(normalizeSyncAdvertisedFeatures(features));
  const result = driver.execute(
    `UPDATE sync_group_members SET advertised_features_json = ?, updated_at = ?
     WHERE device_id = ? AND authorization_id = ? AND joined_at = ? AND state = 'active'
       AND COALESCE(advertised_features_json, '') <> ?`,
    [value, new Date().toISOString(), normalizedDeviceId, member.authorization_id, member.joined_at, value]
  );
  return result.changes > 0;
}
