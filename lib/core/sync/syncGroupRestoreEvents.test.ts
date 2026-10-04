// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS } from '../database/syncGroupRestoreSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../database/syncGroupSchemaStatements.js';
import { SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS } from '../database/syncIdentityReceiptSchemaStatements.js';
import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from '../database/syncPackDependencyStagingSchema.js';

import {
  loadLatestSyncGroupRestoreEvent,
  markSyncGroupRestoreApplied,
  receiveSyncGroupRestoreEvent
} from './syncGroupRestoreEvents.js';

it('keeps the later offline restore, including after replays and restart', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.pragma('foreign_keys = ON');
    for (const statement of [...SYNC_GROUP_SCHEMA_STATEMENTS, ...SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS,
      ...SYNC_PACK_DEPENDENCY_STAGING_SCHEMA, ...SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS]) {
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
    sqlite.exec(`INSERT INTO sync_identity_receive_rounds VALUES
      ('group', 'A', 'view', 0, 'page', 'now');
      INSERT INTO sync_identity_pack_receipts VALUES
      ('group', 'A', 'view', 'page', 'pack', 'hash', 'now');
      INSERT INTO sync_identity_peer_baselines
      (group_id, local_device_id, peer_device_id, local_epoch, peer_epoch,
       local_watermark, peer_watermark, local_view_id, peer_view_id, verified_at)
      VALUES ('group', 'local', 'A', 'epoch', 'epoch', 'now', 'now', 'view', 'view', 'now')`);
    await receiveSyncGroupRestoreEvent(port, later);
    for (const table of ['sync_identity_receive_rounds', 'sync_identity_pack_receipts',
      'sync_identity_peer_baselines']) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
        .toEqual({ count: 0 });
    }
    await receiveSyncGroupRestoreEvent(port, first);
    await expect(markSyncGroupRestoreApplied(port, first)).rejects.toThrow('sync_group_restore_superseded');
    expect(await loadLatestSyncGroupRestoreEvent(port, 'group')).toEqual({ event: later, applied: false });
    await markSyncGroupRestoreApplied(port, later);
    expect(await loadLatestSyncGroupRestoreEvent(port, 'group')).toEqual({ event: later, applied: true });
  } finally {
    sqlite.close();
  }
});
