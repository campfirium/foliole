import { openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { requestSyncFixtureIdentity } from './desktopRequestSyncFixtureIdentity.js';
import { markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

export async function initializeFixtureDatabase(deviceId: string) {
  await initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  initializeSyncGroup(deviceId);
}

function initializeSyncGroup(deviceId: string) {
  const driver = openDatabaseConnection().driver;
  const now = '2026-10-05T00:00:00.000Z';
  const groupKey = Buffer.alloc(32, 7).toString('base64url');
  driver.execute(`INSERT OR IGNORE INTO sync_groups VALUES ('t326-group', 'T326', ?, ?, ?)`,
    [groupKey, now, now]);
  for (const name of ['desktop-a', 'desktop-b'] as const) {
    const identity = deviceId.startsWith('[') ? requestSyncFixtureIdentity(name) : null;
    const memberId = identity?.identity_key ?? name;
    driver.execute(`INSERT OR IGNORE INTO sync_group_devices VALUES
      ('t326-group', ?, ?, ?, ?, 'desktop', 'active', ?, NULL, ?, ?)`,
    [memberId, identity?.device_anchor ?? `${memberId}-anchor`, identity?.canonical_library_path ?? `/t326/${memberId}`, name, now, now, now]);
  }
  driver.execute(`INSERT OR IGNORE INTO sync_group_local_state VALUES (1, 't326-group', ?, 'active', ?)`,
    [deviceId, now]);
  for (const peer of ['desktop-a', 'desktop-b']) if (peer !== deviceId) markDesktopSyncGroupMemberStateReady(peer);
}
