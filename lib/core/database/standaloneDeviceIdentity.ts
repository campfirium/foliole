import type { DatabaseDriver } from './driver.js';

export const STANDALONE_DEVICE_UUID_KEY = 'standalone_device_uuid';

export function loadStandaloneDeviceUuid(driver: DatabaseDriver) {
  const row = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [STANDALONE_DEVICE_UUID_KEY]);
  if (!row) return null;
  let value: unknown;
  try { value = JSON.parse(row.value); }
  catch { throw new Error('standalone_device_uuid_invalid'); }
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('standalone_device_uuid_invalid');
  }
  return value;
}
