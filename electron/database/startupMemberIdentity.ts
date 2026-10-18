import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { loadDesktopLibraryWriterBinding } from '../deviceAnchorStore.js';

import type { DatabaseConnection } from './connection.js';

export function assertStartupMemberIdentity(connection: DatabaseConnection) {
  const { driver } = connection;
  if (!driver.queryOne("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'sync_group_local_state'")) return;
  const local = driver.queryOne<{ group_id: string; local_device_identity_key: string }>(
    "SELECT group_id, local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'"
  );
  if (!local) return;
  const binding = loadDesktopLibraryWriterBinding(connection.dbPath);
  const expected = createSyncGroupDeviceIdentity({ group_id: local.group_id,
    device_anchor: binding.deviceAnchor, library_path: binding.libraryPath,
    path_flavor: process.platform === 'win32' ? 'windows' : 'posix' });
  const member = driver.queryOne<{ device_anchor: string; canonical_library_path: string }>(
    `SELECT device_anchor, canonical_library_path FROM sync_group_devices
     WHERE group_id = ? AND device_identity_key = ? AND state = 'active'`,
    [local.group_id, local.local_device_identity_key]
  );
  if (local.local_device_identity_key === expected.identity_key &&
      member?.device_anchor === expected.device_anchor &&
      member.canonical_library_path === expected.canonical_library_path) return;
  const error = new Error('This library is linked to a different device or location. Open it on its original device and at its original location.');
  error.name = 'LibraryIdentityMismatch';
  throw error;
}
