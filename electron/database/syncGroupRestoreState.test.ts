// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { receiveDesktopSyncGroupRestoreState } from './syncGroupRestoreState.js';

it('records a newer restore event as pending without retired identity receipts', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    receiveDesktopSyncGroupRestoreState(createBetterSqlite3Driver(db), 'group', {
      event: { group_id: 'group', restore_id: 'new',
        restored_at: '2026-10-04T00:00:00.000Z', source_device_identity_key: 'source' },
      applied: true
    });
    expect(db.prepare('SELECT restore_id, applied_at FROM sync_group_restore_events').all())
      .toEqual([{ restore_id: 'new', applied_at: null }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('sync_identity_receive_rounds', 'sync_identity_peer_baselines')").all())
      .toEqual([]);
  } finally { db.close(); }
});
