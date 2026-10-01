/* global process */
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const path = require('node:path');

function built(name) {
  return require(path.join(process.cwd(), 'dist', name));
}

function prepare(nodeCount) {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  try {
    db.exec("ATTACH DATABASE ':memory:' AS search");
    built('lib/core/database/migrations.js').initializeDatabaseSchema(db);
    db.exec("ATTACH DATABASE ':memory:' AS inc");
    for (const sql of built('lib/core/sync/syncPackSchema.js').PACK_SCHEMA) {
      db.exec(sql.replace('CREATE TABLE ', 'CREATE TABLE inc.'));
    }
    const insert = db.prepare(`INSERT INTO nodes
      (id, parent_id, kind, title, content, created_at, updated_at)
      VALUES (?, ?, 'topic', 'Benchmark', '', '2026-10-01', '2026-10-01')`);
    db.transaction(() => {
      for (let index = 0; index < nodeCount; index++) {
        insert.run(`bench-${index}`, index === 0 ? null : `bench-${Math.floor((index - 1) / 20)}`);
      }
    })();
    const columns = built('lib/core/sync/syncPackNodeFields.js').SYNC_PACK_NODE_COLUMNS.join(', ');
    db.exec(`INSERT INTO inc.nodes (${columns}) SELECT ${columns} FROM main.nodes;
      INSERT INTO inc.sync_object_state
        (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      SELECT 'node', id, rowid, 'hash', 'Host', updated_at FROM inc.nodes;
      DELETE FROM main.nodes;`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

async function measure(db, count) {
  const port = built('electron/database/betterSqliteDbPort.js').createBetterSqliteDbPort(db);
  const changes = () => db.prepare('SELECT total_changes() AS count').get().count;
  const before = changes();
  const started = performance.now();
  await built('lib/core/sync/syncPackNodeApplyExecutor.js').applySyncPackNodesWithDbPort(port);
  const durationMs = performance.now() - started;
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM nodes').get().count, count);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM nodes n JOIN inc.nodes i ON n.id = i.id
    WHERE n.parent_id IS NOT i.parent_id OR n.title IS NOT i.title`).get().count, 0);
  return { durationMs, sqliteChangedRows: changes() - before, nodeCount: count };
}

async function runFixedSyncBenchmark({ nodeCount, repeats }) {
  const first = [];
  const unchanged = [];
  for (let sample = 0; sample < repeats; sample++) {
    const db = prepare(nodeCount);
    try {
      first.push(await measure(db, nodeCount));
      unchanged.push(await measure(db, nodeCount));
    } finally {
      db.close();
    }
  }
  return { boundary: 'node pack projection; in-memory SQLite; excludes transport and resources', first, unchanged };
}

module.exports = { runFixedSyncBenchmark };
