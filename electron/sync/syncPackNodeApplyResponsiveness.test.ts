// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncPackNodesWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { SYNC_PACK_NODE_COLUMNS } from '../../lib/core/sync/syncPackNodeFields.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it.each(['existing', 'new'] as const)('applies a large %s node tree without seconds of synchronous work', async (mode) => {
  const db = new Database(':memory:');
  try {
    db.exec("ATTACH DATABASE ':memory:' AS search");
    initializeDatabaseSchema(db);
    db.exec("ATTACH DATABASE ':memory:' AS inc");
    for (const sql of PACK_SCHEMA) db.exec(sql.replace('CREATE TABLE ', 'CREATE TABLE inc.'));
    const insert = db.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES (?, ?, 'topic', 'Existing node', '', '2026-09-25', '2026-09-25')`);
    db.transaction(() => {
      for (let i = 0; i < 3500; i++) insert.run(`node-${i}`, i === 0 ? null : `node-${Math.floor((i - 1) / 20)}`);
    })();
    db.exec(`INSERT INTO inc.nodes (${SYNC_PACK_NODE_COLUMNS.join(', ')}) SELECT ${SYNC_PACK_NODE_COLUMNS.join(', ')} FROM main.nodes;
      INSERT INTO inc.sync_object_state
        (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      SELECT 'node', id, rowid, 'hash', 'Host', updated_at FROM inc.nodes;
      CREATE TABLE IF NOT EXISTS sync_delivery_receipts (peer_id TEXT);`);
    if (mode === 'new') db.exec('DELETE FROM main.nodes');
    const started = performance.now();
    await applySyncPackNodesWithDbPort(createBetterSqliteDbPort(db));
    const duration = performance.now() - started;
    expect(db.prepare('SELECT COUNT(*) AS count FROM nodes').get()).toEqual({ count: 3500 });
    expect(duration).toBeLessThan(2000);
  } finally {
    db.close();
  }
}, 45000);
