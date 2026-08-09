import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { loadSyncPackGroupRows } from './syncPackGroupRows.js';

it('exports only stable Sync Group membership facts', () => {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite);
  const now = '2026-08-09T00:00:00.000Z';
  driver.execute(
    `INSERT INTO sync_groups
       (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
     VALUES ('group-1', 'Daily Group', 'timeline-1', 'device-a', ?, ?)`, [now, now]
  );
  driver.execute(
    `INSERT INTO sync_group_local_state
       (singleton_id, group_id, local_device_id, member_state, updated_at)
     VALUES (1, 'group-1', 'device-a', 'active', ?)`, [now]
  );
  for (const [deviceId, state] of [['device-a', 'active'], ['device-b', 'provisioning']] as const) {
    driver.execute(
      `INSERT INTO sync_group_members
         (group_id, device_id, device_kind, device_name, state, approved_by_device_id,
          authorization_id, joined_at, updated_at)
       VALUES ('group-1', ?, 'desktop', ?, ?, 'device-a', ?, ?, ?)`,
      [deviceId, deviceId, state, `authorization-${deviceId}`, now, now]
    );
  }

  expect(loadSyncPackGroupRows(driver).members.map((member) => member.device_id)).toEqual(['device-a']);
  sqlite.close();
});
