import type { DatabaseDriver } from './driver.js';

const DEVICE_ID_KEY = 'device_id';
const LEGACY_DESKTOP_DEVICE_ID_KEY = 'desktop_device_id';

function parseSettingValue(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return value.trim() || null;
  }
}

export function loadOrCreateDatabaseDeviceId(driver: DatabaseDriver, now: string) {
  void now;
  const existingDeviceId = loadDatabaseDeviceId(driver);
  if (existingDeviceId) return existingDeviceId;
  throw new Error('Database device profile is unavailable before host initialization.');
}

export function loadDatabaseDeviceId(driver: DatabaseDriver) {
  const activeGroup = driver.queryOne<{ local_device_id: string }>(
    `SELECT l.local_device_identity_key AS local_device_id FROM sync_group_local_state l
     JOIN sync_group_devices d ON d.group_id = l.group_id AND d.device_identity_key = l.local_device_identity_key
     WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active' LIMIT 1`
  );
  const activeGroupDeviceId = parseSettingValue(activeGroup?.local_device_id);
  if (activeGroupDeviceId) return activeGroupDeviceId;
  const existing = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [DEVICE_ID_KEY]);
  const existingDeviceId = parseSettingValue(existing?.value);
  if (existingDeviceId) {
    return existingDeviceId;
  }
  const legacy = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [LEGACY_DESKTOP_DEVICE_ID_KEY]);
  const legacyDeviceId = parseSettingValue(legacy?.value);
  if (legacyDeviceId) {
    return legacyDeviceId;
  }
  return null;
}
