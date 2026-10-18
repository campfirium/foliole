import { randomUUID } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadStandaloneDeviceUuid, STANDALONE_DEVICE_UUID_KEY } from '../../lib/core/database/standaloneDeviceIdentity.js';

import { retagLocalWatchedFolderBindings } from './watchedGroupOwnershipTransition.js';

export function initializeDesktopStandaloneIdentity(driver: DatabaseDriver, now: string) {
  const existing = loadStandaloneDeviceUuid(driver);
  if (existing) return existing;
  const previous = loadLegacyStandaloneDeviceId(driver);
  const id = randomUUID();
  driver.transaction(() => {
    driver.execute('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      [STANDALONE_DEVICE_UUID_KEY, JSON.stringify(id), now]);
    const active = driver.queryOne("SELECT 1 AS present FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'");
    if (!active && typeof previous === 'string' && previous.trim()) {
      retagLocalWatchedFolderBindings(driver, previous.trim(), id, now);
    }
  });
  return id;
}

export function loadLegacyStandaloneDeviceId(driver: DatabaseDriver) {
  const legacy = driver.queryOne<{ value: string }>(`SELECT value FROM settings
    WHERE key IN ('device_id', 'desktop_device_id') ORDER BY key = 'device_id' DESC LIMIT 1`);
  let previous: unknown = null;
  if (legacy) {
    try { previous = JSON.parse(legacy.value); } catch { previous = legacy.value; }
  }
  return typeof previous === 'string' && previous.trim() ? previous.trim() : null;
}
