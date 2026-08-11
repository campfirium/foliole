import type { DatabaseConnection } from './connection.js';
import { loadJsonSetting } from './settingsStore.js';

const DEVICE_ID_KEY = 'device_id';
const LEGACY_DESKTOP_DEVICE_ID_KEY = 'desktop_device_id';
const RESET_PENDING_KEY = 'device_identity_reset_pending';

function normalizeDeviceId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function loadDesktopDeviceId(): string | null {
  return normalizeDeviceId(loadJsonSetting(DEVICE_ID_KEY)) ?? normalizeDeviceId(loadJsonSetting(LEGACY_DESKTOP_DEVICE_ID_KEY));
}

export function loadOrCreateDesktopDeviceId(now = new Date().toISOString()): string {
  void now;
  const existing = loadDesktopDeviceId();
  if (existing) return existing;
  throw new Error('Desktop device profile is unavailable before database initialization.');
}

export function loadStoredDesktopDeviceId(connection: DatabaseConnection) {
  const settings = connection.driver.queryOne<{ present: number }>(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'settings' LIMIT 1"
  );
  if (!settings) return null;
  return readDriverSetting(connection, DEVICE_ID_KEY) ?? readDriverSetting(connection, LEGACY_DESKTOP_DEVICE_ID_KEY);
}

export function refreshDesktopDeviceProfile(args: {
  clearCredentials: () => void;
  connection: DatabaseConnection;
  currentDeviceId: string;
  now?: string;
  previousDeviceId: string | null;
  protect: () => void;
}) {
  const currentDeviceId = normalizeDeviceId(args.currentDeviceId);
  if (!currentDeviceId) throw new Error('Desktop system name is unavailable.');
  const now = args.now ?? new Date().toISOString();
  const storedDeviceId = readDriverSetting(args.connection, DEVICE_ID_KEY);
  const changed = storedDeviceId !== currentDeviceId;
  if (changed && args.previousDeviceId) args.protect();
  if (changed) writeCurrentProfile(args.connection, currentDeviceId, args.previousDeviceId, now);
  const resetPending = readDriverSetting(args.connection, RESET_PENDING_KEY) === currentDeviceId;
  if (resetPending) {
    args.clearCredentials();
    args.connection.driver.execute('DELETE FROM settings WHERE key = ?', [RESET_PENDING_KEY]);
  }
  return { changed, currentDeviceId, previousDeviceId: args.previousDeviceId };
}

function writeCurrentProfile(
  connection: DatabaseConnection,
  currentDeviceId: string,
  previousDeviceId: string | null,
  now: string
) {
  connection.driver.transaction((driver) => {
    driver.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [DEVICE_ID_KEY, JSON.stringify(currentDeviceId), now]
    );
    driver.execute('DELETE FROM settings WHERE key = ?', [LEGACY_DESKTOP_DEVICE_ID_KEY]);
    if (!previousDeviceId) return;
    driver.execute('DELETE FROM sync_group_local_state WHERE singleton_id = 1 AND local_device_id = ?',
      [previousDeviceId]);
    driver.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [RESET_PENDING_KEY, JSON.stringify(currentDeviceId), now]
    );
  });
}

function readDriverSetting(connection: DatabaseConnection, key: string) {
  const row = connection.driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return normalizeDeviceId(JSON.parse(row.value));
  } catch {
    return normalizeDeviceId(row.value);
  }
}
