import { randomUUID } from 'node:crypto';
import os from 'node:os';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { loadDesktopLibraryWriterBinding } from '../deviceAnchorStore.js';

import { resetSyncGeneration } from './syncGroupBackupRestore.js';

/**
 * Member identity follows this device anchor and library location. A copied or moved
 * library stays in its group as a new member; the previous member and its sources stay intact.
 */
export function rebindStartupMemberIdentity(driver: DatabaseDriver, dbPath: string, now = new Date().toISOString()) {
  const local = driver.queryOne<{ group_id: string; local_device_identity_key: string }>(
    "SELECT group_id, local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'"
  );
  if (!local) return null;
  const binding = loadDesktopLibraryWriterBinding(dbPath);
  const expected = createSyncGroupDeviceIdentity({ group_id: local.group_id,
    device_anchor: binding.deviceAnchor, library_path: binding.libraryPath,
    path_flavor: process.platform === 'win32' ? 'windows' : 'posix' });
  if (local.local_device_identity_key === expected.identity_key) return null;
  const previous = driver.queryOne<{ device_name: string }>(
    'SELECT device_name FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?',
    [local.group_id, local.local_device_identity_key]
  );
  driver.transaction(() => {
    driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
      canonical_library_path, device_name, platform, state, joined_at, left_at, last_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, NULL, ?)
      ON CONFLICT(group_id, device_identity_key) DO UPDATE SET state = 'active', left_at = NULL,
        device_name = excluded.device_name, platform = excluded.platform, updated_at = excluded.updated_at`,
    [local.group_id, expected.identity_key, expected.device_anchor, expected.canonical_library_path,
      previous?.device_name ?? 'Desktop', resolveDesktopSyncGroupPlatform(os.platform(), os.release()), now, now]);
    driver.execute('UPDATE sync_group_local_state SET local_device_identity_key = ?, updated_at = ? WHERE singleton_id = 1',
      [expected.identity_key, now]);
    // The copy must not reuse the original's sequence and proof generation.
    resetSyncGeneration(driver, `rebind-${randomUUID()}`);
  });
  return { previousDeviceId: local.local_device_identity_key, deviceId: expected.identity_key };
}
