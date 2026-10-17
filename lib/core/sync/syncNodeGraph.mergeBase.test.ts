// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import type { DbPort } from './dbPort.js';
import { loadAncestorMetadata, loadSyncNodeAncestorGraph } from './syncNodeAncestorGraph.js';
import { loadMergeBase, loadMergeBaseCandidates, storedSyncNodeVersionBody } from './syncNodeGraph.js';
import { loadAncestorDistances } from './syncNodeLineage.js';
import { mergeSyncText } from './syncTextDiff3.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));

function graph(parents: Record<string, string[]>, bodies: Record<string, string>) {
  const db = new Database(':memory:');
  databases.push(db);
  db.exec(`CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT, ordinal INTEGER);
    CREATE INDEX edge_version ON node_sync_version_parents(version_id);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, parent_version_id TEXT, body_text TEXT, snapshot_json TEXT);
    CREATE TABLE node_sync_tombstones (version_id TEXT, parent_version_id TEXT);`);
  for (const [id, edges] of Object.entries(parents)) {
    db.prepare('INSERT INTO node_sync_versions VALUES (?, NULL, ?, ?)').run(id, bodies[id] ?? null, '{"content":null}');
    for (const [ordinal, parent] of edges.entries()) {
      db.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, ?)').run(id, parent, ordinal);
    }
  }
  return createBetterSqliteDbPort(db);
}

it('uses the newer common ancestor even when an older shortcut is closer', async () => {
  const port = graph({
    A: [], B: ['A'], left: ['B', 'A'], right: ['B', 'A']
  }, { A: 'x=0\ny=0\n', B: 'x=1\ny=0\n' });

  const base = await loadMergeBase(port, 'left', 'right');
  expect(base?.version_id).toBe('B');
  expect(mergeSyncText(base?.body_text ?? '', 'x=0\ny=0\n', 'x=1\ny=1\n'))
    .toEqual({ kind: 'merged', text: 'x=0\ny=1\n' });
});

it('refuses to choose between incomparable best common ancestors', async () => {
  const port = graph({
    A: [], B: [], left: ['A', 'B'], right: ['B', 'A']
  }, { A: 'a', B: 'b' });

  await expect(loadMergeBase(port, 'left', 'right'))
    .rejects.toThrow('sync_node_merge_base_ambiguous');
});

it('keeps a bodyless version available for ancestry without inventing its text', async () => {
  const port = graph({ A: [], B: ['A'], C: ['B'] }, {});
  const base = await loadMergeBase(port, 'C', 'B');

  expect(base?.version_id).toBe('B');
  expect(storedSyncNodeVersionBody(base!)).toBeNull();
});

it('keeps a legacy missing content field missing without inventing empty text', () => {
  expect(storedSyncNodeVersionBody({
    body_text: null,
    content_hash: '',
    created_at: '',
    host_name: '',
    object_id: 'node',
    snapshot_json: '{}',
    version_id: 'legacy'
  })).toBeNull();
});

it('loads a long related graph with bounded SQL calls', async () => {
  const parents: Record<string, string[]> = { root: [] };
  for (let index = 0; index < 239; index++) parents[`v${index}`] = [index ? `v${index - 1}` : 'root'];
  const db = graph(parents, {});
  let queries = 0;
  const port: DbPort = { ...db, async query(sql, args) { queries++; return db.query(sql, args); } };
  expect((await loadMergeBase(port, 'v238', 'v237'))?.version_id).toBe('v237');
  expect(queries).toBeLessThanOrEqual(3);
});

it('preserves parent order, legacy precedence, tombstones, missing ancestors and cycles', async () => {
  const db = graph({ left: ['tomb', 'legacy', 'missing'], right: ['missing', 'legacy', 'tomb'],
    legacy: [], root: [], unrelated: ['unrelated-parent'], cycle: ['cycle'] }, {});
  await db.run("UPDATE node_sync_versions SET parent_version_id = 'root' WHERE version_id = 'legacy'");
  await db.run("INSERT INTO node_sync_tombstones VALUES ('legacy', 'wrong'), ('tomb', 'root'), ('tomb', 'wrong')");
  const view = await loadSyncNodeAncestorGraph(db, ['left', 'right', 'cycle']);
  expect(view.parents.get('left')).toEqual(['tomb', 'legacy', 'missing']);
  expect(view.parents.get('legacy')).toEqual(['root']);
  expect(view.parents.get('tomb')).toEqual(['root']);
  expect(view.parents.get('missing')).toEqual([]);
  expect(view.parents.has('wrong')).toBe(false);
  expect(view.parents.has('unrelated')).toBe(false);
  expect([...await loadAncestorDistances(db, 'left', view.parents)]).toEqual([
    ['left', 0], ['tomb', 1], ['legacy', 1], ['missing', 1], ['root', 2]
  ]);
  expect(await loadMergeBaseCandidates(db, 'left', 'right', view)).toEqual(['tomb', 'legacy', 'missing']);
});

it('reads new graph facts on the next call instead of retaining a global cache', async () => {
  const db = graph({ left: ['root'], right: ['root'], root: [] }, {});
  expect(await loadMergeBaseCandidates(db, 'left', 'right')).toEqual(['root']);
  await db.run("INSERT INTO node_sync_version_parents VALUES ('right', 'left', 1)");
  expect(await loadMergeBaseCandidates(db, 'left', 'right')).toEqual(['left']);
});

it('batches metadata, remembers missing facts only in the current view, and chunks many roots', async () => {
  const parents = Object.fromEntries(Array.from({ length: 405 }, (_, index) => [`v${index}`, []]));
  const db = graph(parents, {});
  let queries = 0;
  const port: DbPort = { ...db, async query(sql, args) { queries++; return db.query(sql, args); } };
  const ids = [...Object.keys(parents), 'missing'];
  const view = await loadSyncNodeAncestorGraph(port, ids);
  expect(view.parents.size).toBe(406);
  const facts = await loadAncestorMetadata(port, ids, view);
  expect(facts).toHaveLength(405);
  expect(facts[0]).toMatchObject({ version_id: 'v0', selection_id: 'v0', parent_id: null, deleted_at: null });
  expect(queries).toBe(4);
  expect(await loadAncestorMetadata(port, ids, view)).toEqual(facts);
  expect(queries).toBe(4);
  await db.run("INSERT INTO node_sync_versions VALUES ('missing', NULL, NULL, '{}')");
  const next = await loadSyncNodeAncestorGraph(port, ['missing']);
  expect(await loadAncestorMetadata(port, ['missing'], next)).toHaveLength(1);
});
