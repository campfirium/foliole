// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { receiveDesktopSyncGroupRestoreState } from './syncGroupRestoreState.js';

it('retires identity receipts when a newer restore event arrives by member state', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_identity_receive_rounds VALUES
      ('group', 'source', 'view', 0, 'page', 'now');
      INSERT INTO sync_identity_peer_baselines
      (group_id, local_device_id, peer_device_id, local_epoch, peer_epoch,
       local_watermark, peer_watermark, local_view_id, peer_view_id, verified_at)
      VALUES ('group', 'target', 'source', 'old', 'old', 'now', 'now', 'view', 'view', 'now')`);
    receiveDesktopSyncGroupRestoreState(createBetterSqlite3Driver(db), 'group', {
      event: { group_id: 'group', restore_id: 'new',
        restored_at: '2026-10-04T00:00:00.000Z', source_device_identity_key: 'source' },
      applied: true
    });
    expect(db.prepare('SELECT * FROM sync_identity_receive_rounds').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM sync_identity_peer_baselines').all()).toEqual([]);
  } finally { db.close(); }
});
