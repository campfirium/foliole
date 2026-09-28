import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import {
  assertSyncPackFactClaimsStillHeld,
  decodeSyncPackFactClaims,
  describeVersionFact,
  encodeSyncPackFactClaims,
  probeSyncPackFactPresence,
  selectMissingSyncPackFacts,
  type SyncPackFactPage
} from '../../lib/core/sync/syncPackFactPresence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('selects only missing version bodies, parent relations, and review operations', async () => {
  const db = fixture();
  try {
    const versions = Array.from({ length: 24 }, (_, index) => version(index));
    for (const row of versions.slice(0, 23)) insertVersion(db, row);
    for (let index = 1; index < 23; index += 1) {
      db.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)')
        .run(`v${index}`, `v${index - 1}`);
    }
    for (let index = 0; index < 5; index += 1) insertReview(db, review(index));
    const page: SyncPackFactPage = {
      versions: versions.map(describeVersionFact),
      parents: versions.slice(1).map((row, index) => ({
        version_id: row.version_id, parent_version_id: `v${index}`, ordinal: 0
      })),
      reviews: Array.from({ length: 6 }, (_, index) => review(index))
    };
    const local = await probeSyncPackFactPresence(createBetterSqliteDbPort(db), page);
    const claims = decodeSyncPackFactClaims(page, encodeSyncPackFactClaims(page, local));
    const missing = selectMissingSyncPackFacts({
      versions, parents: page.parents, reviews: page.reviews
    }, claims);
    expect(missing.versions.map((row) => row.version_id)).toEqual(['v23']);
    expect(missing.parents.map((row) => row.version_id)).toEqual(['v23']);
    expect(missing.reviews.map((row) => row.op_id)).toEqual(['op5']);
  } finally { db.close(); }
});

it('does not claim a reclaimed body and rejects the same version ID with different body', async () => {
  const db = fixture();
  try {
    insertVersion(db, { ...version(0), body_text: null, snapshot_json: '{"content":null}' });
    const page = { versions: [describeVersionFact(version(0))], parents: [], reviews: [] };
    expect((await probeSyncPackFactPresence(createBetterSqliteDbPort(db), page)).versions).toEqual([]);
    db.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
      .run('different', '{"content":"different"}', 'v0');
    await expect(probeSyncPackFactPresence(createBetterSqliteDbPort(db), page))
      .rejects.toThrow('sync_pack_node_version_immutable_mismatch:v0');
  } finally { db.close(); }
});

it('rejects a claimed body that is reclaimed after the presence probe', async () => {
  const db = fixture();
  try {
    insertVersion(db, version(0));
    const port = createBetterSqliteDbPort(db);
    const page = { versions: [describeVersionFact(version(0))], parents: [], reviews: [] };
    const claims = await probeSyncPackFactPresence(port, page);
    expect(claims.versions).toEqual(['v0']);
    db.prepare('UPDATE node_sync_versions SET body_text = NULL, snapshot_json = ? WHERE version_id = ?')
      .run('{"content":null}', 'v0');
    await expect(assertSyncPackFactClaimsStillHeld(port, page, claims))
      .rejects.toThrow('sync_pack_fact_presence_changed');
  } finally { db.close(); }
});

function version(index: number) {
  return {
    version_id: `v${index}`, object_id: 'node-1',
    parent_version_id: index ? `v${index - 1}` : null,
    host_name: 'source', created_at: `2026-09-${String(index + 1).padStart(2, '0')}`,
    content_hash: `hash-${index}`, body_text: `body-${index}`,
    snapshot_json: JSON.stringify({ content: `body-${index}` })
  };
}

function review(index: number) {
  return {
    id: `review-${index}`, op_id: `op${index}`, host_name: 'source', node_id: 'node-1',
    grade: 3, scheduler_version: '1', reviewed_at: `2026-09-${String(index + 1).padStart(2, '0')}`,
    due_before: '2026-09-01', stability_before: 1, difficulty_before: 2,
    due_after: '2026-09-02', stability_after: 3, difficulty_after: 4
  };
}

function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT,
      body_text TEXT, snapshot_json TEXT);
    CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT,
      ordinal INTEGER, PRIMARY KEY(version_id, parent_version_id));
    CREATE TABLE review_log (id TEXT, op_id TEXT PRIMARY KEY, host_name TEXT, node_id TEXT,
      grade INTEGER, scheduler_version TEXT, reviewed_at TEXT, due_before TEXT,
      stability_before REAL, difficulty_before REAL, due_after TEXT,
      stability_after REAL, difficulty_after REAL);
  `);
  return db;
}

function insertVersion(db: Database.Database,
  row: Omit<ReturnType<typeof version>, 'body_text'> & { body_text: string | null }) {
  db.prepare(`INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.version_id, row.object_id, row.parent_version_id, row.host_name,
      row.created_at, row.content_hash, row.body_text, row.snapshot_json);
}

function insertReview(db: Database.Database, row: ReturnType<typeof review>) {
  db.prepare(`INSERT INTO review_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(...Object.values(row));
}
