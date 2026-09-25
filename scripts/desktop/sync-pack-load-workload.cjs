/* global process, setImmediate, setTimeout */
const fs = require('node:fs');
const path = require('node:path');

function loadBuiltModule(relativePath) {
  return require(path.join(process.cwd(), 'dist', relativePath));
}

function createLargePack(nodeCount) {
  const Database = require('better-sqlite3');
  const { initializeDatabaseSchema } = loadBuiltModule('lib/core/database/migrations.js');
  const { PACK_SCHEMA } = loadBuiltModule('lib/core/sync/syncPackSchema.js');
  const { SYNC_PACK_NODE_COLUMNS } = loadBuiltModule('lib/core/sync/syncPackNodeFields.js');
  const db = new Database(':memory:');
  db.exec("ATTACH DATABASE ':memory:' AS search");
  initializeDatabaseSchema(db);
  db.exec("ATTACH DATABASE ':memory:' AS inc");
  for (const sql of PACK_SCHEMA) db.exec(sql.replace('CREATE TABLE ', 'CREATE TABLE inc.'));
  const insert = db.prepare(`INSERT INTO nodes
    (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, ?, 'topic', 'Existing node', '', '2026-09-25', '2026-09-25')`);
  db.transaction(() => {
    for (let index = 0; index < nodeCount; index++) {
      insert.run(`perf-node-${index}`, index === 0 ? null : `perf-node-${Math.floor((index - 1) / 20)}`);
    }
  })();
  db.exec(`INSERT INTO inc.nodes (${SYNC_PACK_NODE_COLUMNS.join(', ')})
    SELECT ${SYNC_PACK_NODE_COLUMNS.join(', ')} FROM main.nodes;
    INSERT INTO inc.sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    SELECT 'node', id, rowid, 'hash', 'Host', updated_at FROM inc.nodes;
    CREATE TABLE IF NOT EXISTS sync_delivery_receipts (peer_id TEXT);`);
  return db;
}

async function runSyncPackLoad({ markerPath, nodeCount, blockMs }) {
  const db = createLargePack(nodeCount);
  try {
    const { createBetterSqliteDbPort } = loadBuiltModule('electron/database/betterSqliteDbPort.js');
    const { applySyncPackNodesWithDbPort } = loadBuiltModule(
      'lib/core/sync/syncPackNodeApplyExecutor.js');
    const port = createBetterSqliteDbPort(db);
    fs.writeFileSync(markerPath, 'ready');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const startedAt = Date.now();
    if (blockMs > 0) {
      const until = Date.now() + blockMs;
      while (Date.now() < until) { /* controlled test-only event-loop block */ }
    }
    let passes = 0;
    do {
      await applySyncPackNodesWithDbPort(port);
      passes++;
      await new Promise((resolve) => setImmediate(resolve));
    } while (Date.now() - startedAt < 2200);
    const endedAt = Date.now();
    const nodeCountAfter = db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count;
    return { startedAt, endedAt, durationMs: endedAt - startedAt,
      result: { passes, nodeCount: nodeCountAfter } };
  } finally {
    db.close();
  }
}

module.exports = { runSyncPackLoad };
