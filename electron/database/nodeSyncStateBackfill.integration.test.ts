// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => { throw new Error('no_app_paths_in_schema_test'); } }));

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { NODE_SYNC_STATE_MISSING_SQL } from '../../lib/core/database/nodeSyncStateBackfillSchema.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { restorePreLocalDerivedIndexSchema } from './localDerivedIndexMigration.testSupport.js';
import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { hasPendingNodeSyncVersions } from './nodeSyncVersions.js';

// The whole-table check this queue replaces, kept verbatim as the reference.
const ORIGINAL_PENDING_SQL = `SELECT 1 FROM nodes n WHERE n.id != ? AND (
  n.sync_dirty = 1 OR n.current_version_id IS NULL OR (
    EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = n.current_version_id)
    AND NOT EXISTS (SELECT 1 FROM sync_object_state s
      WHERE s.object_type = 'node' AND s.object_id = n.id))) LIMIT 1`;

const opened: Database.Database[] = [];
afterEach(() => { for (const sqlite of opened.splice(0)) sqlite.close(); });

function library() {
  const sqlite = new Database(':memory:');
  opened.push(sqlite);
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

function writer(sqlite: Database.Database) {
  let seq = 1_000_000;
  return {
    node: sqlite.prepare(`INSERT INTO nodes (id, title, current_version_id, sync_dirty, created_at, updated_at)
      VALUES (?, ?, ?, 0, '2026-11-01', ?) ON CONFLICT(id) DO NOTHING`),
    version: (id: string, objectId: string) => sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash) VALUES (?, ?, 'h', '2026-11-01', 'c')
      ON CONFLICT(version_id) DO NOTHING`).run(id, objectId),
    state: (id: string) => sqlite.prepare(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
      content_hash, last_modified_by_host_name, updated_at) VALUES ('node', ?, ?, 'c', 'h', 'now')
      ON CONFLICT(object_type, object_id) DO NOTHING`).run(id, seq += 1)
  };
}

const missing = (sqlite: Database.Database) => sqlite.prepare(NODE_SYNC_STATE_MISSING_SQL).pluck().all() as string[];
const queued = (sqlite: Database.Database) =>
  new Set(sqlite.prepare('SELECT node_id FROM node_sync_state_backfill').pluck().all() as string[]);

function random(seed: number) {
  let value = seed;
  return (limit: number) => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648;
    return value % limit;
  };
}

function runRandomOperations() {
  const sqlite = library();
  const driver = createBetterSqlite3Driver(sqlite);
  const write = writer(sqlite);
  const next = random(7);
  const nodeId = () => `n${next(12)}`;
  const versionId = () => [null, `v${next(16)}`][Math.min(1, next(4))];
  for (let step = 0; step < 4000; step += 1) {
    const op = next(9);
    if (op === 0) write.node.run(nodeId(), 'x', versionId(), `t${step}`);
    if (op === 1) sqlite.prepare('UPDATE nodes SET current_version_id = ? WHERE id = ?').run(versionId(), nodeId());
    if (op === 2) write.version(`v${next(16)}`, nodeId());
    if (op === 3) write.state(nodeId());
    if (op === 4) sqlite.prepare("DELETE FROM sync_object_state WHERE object_type = 'node' AND object_id = ?").run(nodeId());
    if (op === 5) sqlite.prepare('DELETE FROM nodes WHERE id = ? AND id <> ?').run(nodeId(), VIRTUAL_ROOT_NODE_ID);
    if (op === 6) sqlite.prepare(`UPDATE OR IGNORE sync_object_state SET object_id = ?
      WHERE object_type = 'node' AND object_id = ?`).run(nodeId(), nodeId());
    if (op === 7) sqlite.prepare('DELETE FROM node_sync_versions WHERE version_id = ?').run(`v${next(16)}`);
    if (op === 8 && next(6) === 0) {
      backfillMissingNodeSyncState(driver);
      expect(missing(sqlite)).toEqual([]);
    }
    const queue = queued(sqlite);
    expect(missing(sqlite).filter(id => !queue.has(id))).toEqual([]);
    expect(hasPendingNodeSyncVersions(driver))
      .toBe(Boolean(sqlite.prepare(ORIGINAL_PENDING_SQL).get(VIRTUAL_ROOT_NODE_ID)));
  }
}

describe('node sync state repair queue', () => {
  it('always holds every node the whole-table scan finds, and answers pending checks the same way', runRandomOperations);

  it('leaves the queue empty after an ordinary version write and repair', () => {
    const sqlite = library();
    const write = writer(sqlite);
    write.node.run('plain', 'Plain', null, 'now');
    write.version('plain-v1', 'plain');
    sqlite.prepare("UPDATE nodes SET current_version_id = 'plain-v1' WHERE id = 'plain'").run();
    expect([...queued(sqlite)]).toEqual(['plain']);
    write.state('plain');
    expect([...queued(sqlite)]).toEqual([]);
  });

  it('fills the queue once while upgrading a 204 library', { meta: { calibratedMs: 20_000 } }, () => {
    const sqlite = library();
    restorePreLocalDerivedIndexSchema(sqlite, 204);
    const write = writer(sqlite);
    const count = 50_000;
    sqlite.transaction(() => {
      for (let index = 0; index < count; index += 1) {
        const id = `big-${index}`;
        write.version(`${id}-v`, id);
        write.node.run(id, id, index % 50 === 0 ? `${id}-gone` : `${id}-v`, 'now');
        if (index % 10 !== 0) write.state(id);
      }
    })();
    const expected = missing(sqlite).sort();
    expect(expected.length).toBe(count / 10 - count / 50);
    const started = performance.now();
    initializeDatabaseSchema(sqlite);
    const elapsed = performance.now() - started;
    console.info(`[schema 205] upgrade with ${count} nodes took ${elapsed.toFixed(0)} ms`);
    expect([...queued(sqlite)].sort()).toEqual(expected);
    expect(elapsed).toBeLessThan(5_000);
  });
});
