// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../database/syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../database/syncGroupSchemaStatements.js';

import {
  loadLatestSyncGroupRestoreEvent,
  markSyncGroupRestoreApplied,
  receiveSyncGroupRestoreEvent
} from './syncGroupRestoreEvents.js';

it('keeps the later offline restore, including after replays and restart', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.pragma('foreign_keys = ON');
    for (const statement of [...SYNC_GROUP_SCHEMA_STATEMENTS, ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS]) {
      sqlite.exec(statement);
    }
    sqlite.prepare(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')`).run();
    const port = createBetterSqliteDbPort(sqlite);
    const first = { group_id: 'group', restore_id: 'first',
      restored_at: '2026-09-27T12:00:00.000Z', source_device_identity_key: 'A' };
    const later = { ...first, restore_id: 'later',
      restored_at: '2026-09-27T12:00:01.000Z', source_device_identity_key: 'B' };
    await receiveSyncGroupRestoreEvent(port, first);
    await markSyncGroupRestoreApplied(port, first);
    await receiveSyncGroupRestoreEvent(port, later);
    await receiveSyncGroupRestoreEvent(port, first);
    await expect(markSyncGroupRestoreApplied(port, first)).rejects.toThrow('sync_group_restore_superseded');
    expect(await loadLatestSyncGroupRestoreEvent(port, 'group')).toEqual({ event: later, applied: false });
    await markSyncGroupRestoreApplied(port, later);
    expect(await loadLatestSyncGroupRestoreEvent(port, 'group')).toEqual({ event: later, applied: true });
  } finally {
    sqlite.close();
  }
});
