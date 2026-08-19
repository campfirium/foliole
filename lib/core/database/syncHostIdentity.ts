import type { DatabaseDriver } from './driver.js';

const HOST_NAME_KEY = 'host_name';

export function loadOrCreateDatabaseHostName(driver: DatabaseDriver, now: string) {
  void now;
  return requireDatabaseHostName(driver);
}

export function requireDatabaseHostName(driver: DatabaseDriver) {
  const hostName = loadDatabaseHostName(driver);
  if (!hostName) throw new Error('Database host profile is unavailable before Host initialization.');
  return hostName;
}

export function loadDatabaseHostName(driver: DatabaseDriver) {
  const row = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [HOST_NAME_KEY]);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return row.value.trim() || null;
  }
}
