/**
 * The group's External view is what current members provide. A departed member's libraries leave
 * that view at once and keep their local data for a grace period, so a quick rejoin needs no resync.
 */
export const EXTERNAL_DEPARTURE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export const DEPARTED_EXTERNAL_FOLDER_IDS_SQL = `SELECT departed_source.config_ref FROM desktop_sources departed_source
  JOIN sync_group_devices departed_device ON departed_device.device_identity_key =
    json_extract(departed_source.type_settings_json, '$.ownerDeviceIdentityKey')
  WHERE departed_source.source_type = 'external' AND departed_device.state = 'left'`;

export function externalFolderVisibleSql(folderIdExpression: string) {
  return `COALESCE(${folderIdExpression}, '') NOT IN (${DEPARTED_EXTERNAL_FOLDER_IDS_SQL})`;
}

export function externalDepartureCutoff(now: string) {
  return new Date(Date.parse(now) - EXTERNAL_DEPARTURE_GRACE_MS).toISOString();
}
