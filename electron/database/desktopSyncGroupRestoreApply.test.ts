// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applyDesktopRestorePage } from '../sync/desktopSyncGroupRestoreApply.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('clears only the first restore page and marks the event after the final page', async () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.exec(`
      INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
        VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_restore_events
        (restore_id, group_id, restored_at, source_device_identity_key, created_at)
        VALUES ('restore', 'group', '2026-09-27T00:00:00.000Z', 'source', 'now');
      INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
        VALUES ('old', 'topic', 'Old', '', 'now', 'now');
      INSERT INTO sync_pack_resource_articles (group_id, peer_id, article_id)
        VALUES ('group', 'source', 'old');
    `);
    const port = createBetterSqliteDbPort(sqlite);
    for (const [after, next, nodeId] of [[0, 1, 'first'], [1, 2, 'second']] as const) {
      await applyDesktopRestorePage({ after, frontierStateSeq: 2, groupId: 'group', peerId: 'source',
        port, restoreId: 'restore', apply: async (tx) => {
          await tx.run(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
            VALUES (?, 'topic', ?, '', 'now', 'now')`, [nodeId, nodeId]);
          return { toStateSeq: next };
        } });
      expect(sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get(nodeId)).toMatchObject({ id: nodeId });
      expect(sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get('old')).toBeUndefined();
      expect(sqlite.prepare('SELECT article_id FROM sync_pack_resource_articles').all())
        .toEqual([]);
      expect(sqlite.prepare('SELECT applied_at FROM sync_group_restore_events').get())
        .toMatchObject({ applied_at: next === 2 ? expect.any(String) : null });
    }
    expect(sqlite.prepare("SELECT id FROM nodes WHERE id IN ('first', 'second') ORDER BY id").all())
      .toEqual([{ id: 'first' }, { id: 'second' }]);
  } finally {
    sqlite.close();
  }
});
