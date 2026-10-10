// @vitest-environment node

import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import {
  compareFramedSyncInventories,
  type FramedSyncInventoryEntry
} from '../../lib/core/sync/framedSyncInventory.js';
import {
  desktopFramedSyncParentRelationFactId,
  projectDesktopFramedSyncParentRelation,
  projectDesktopFramedSyncReview,
  restoreDesktopFramedSyncParentRelation,
  restoreDesktopFramedSyncReview
} from '../sync/desktopFramedSyncRelationReviewProjection.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { selectDesktopFramedSyncRelationReviewFacts } from './desktopFramedSyncRelationReviewSelection.js';

let sqlite: Database.Database;
let port: DbPort;
const emptyHash = () => new Uint8Array(createHash('sha256').update('node-state').digest());

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE node_sync_versions (
      version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL
    );
    CREATE TABLE node_sync_version_parents (
      version_id TEXT NOT NULL, parent_version_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
      local_path TEXT, observed_at TEXT,
      PRIMARY KEY (version_id, parent_version_id), UNIQUE (version_id, ordinal)
    );
    CREATE TABLE review_log (
      id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, host_name TEXT NOT NULL,
      node_id TEXT NOT NULL, grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL,
      reviewed_at TEXT NOT NULL, due_before TEXT NOT NULL, stability_before REAL NOT NULL,
      difficulty_before REAL NOT NULL, due_after TEXT NOT NULL, stability_after REAL NOT NULL,
      difficulty_after REAL NOT NULL, local_path TEXT, observed_at TEXT
    );
    INSERT INTO node_sync_versions VALUES ('version-child', 'node-1');
    INSERT INTO node_sync_version_parents VALUES
      ('version-child', 'version-parent', 0, '/Users/local/private.md', '2026-10-05T02:00:00Z');
    INSERT INTO review_log VALUES (
      'review-row-1', 'review-op-1', 'device-a', 'node-1', 3, 'fsrs-6',
      '2026-10-05T01:00:00Z', '2026-10-06T01:00:00Z', 2.5, 2.25,
      '2026-10-08T01:00:00Z', 4.5, 3.75,
      '/Users/local/review.json', '2026-10-05T02:00:00Z'
    );`);
  port = createBetterSqliteDbPort(sqlite);
});

afterEach(() => sqlite.close());

async function readFacts(tx: DbPort) {
  const parents = await tx.query(`SELECT version.object_id, parent.version_id,
    parent.parent_version_id, parent.ordinal FROM node_sync_version_parents parent
    JOIN node_sync_versions version ON version.version_id = parent.version_id
    WHERE version.object_id = 'node-1' ORDER BY parent.version_id, parent.ordinal`);
  const reviews = await tx.query(`SELECT id, op_id, host_name, node_id, grade,
    scheduler_version, reviewed_at, due_before, stability_before, difficulty_before,
    due_after, stability_after, difficulty_after FROM review_log
    WHERE node_id = 'node-1' ORDER BY op_id`);
  return [
    ...parents.map(projectDesktopFramedSyncParentRelation),
    ...reviews.map(projectDesktopFramedSyncReview)
  ];
}

async function readEntry(tx: DbPort): Promise<FramedSyncInventoryEntry> {
  const facts = await readFacts(tx);
  return {
    frontierFactIds: [], globalId: 'node-1', objectType: 'node',
    requiredRelationIds: facts.filter((fact) => fact.kind === 3).map((fact) => fact.factId),
    resourceHashes: [], reviewFactIds: facts.filter((fact) => fact.kind === 4).map((fact) => fact.factId),
    sharedStateHash: facts.length ? await canonicalContentId({ blobs: [], facts }) : emptyHash()
  };
}

async function frozenDifference() {
  const local = await port.transaction(readEntry);
  const remote = { ...local, requiredRelationIds: [], reviewFactIds: [],
    sharedStateHash: await canonicalContentId({ blobs: [], facts: [] }) };
  const [difference] = compareFramedSyncInventories({ local: [local], remote: [remote] });
  if (!difference) throw new Error('difference_missing');
  return { difference, local };
}

it('selects the exact relation and review from SQLite and ignores local-only columns', async () => {
  const { difference, local } = await frozenDifference();
  sqlite.exec(`UPDATE node_sync_version_parents SET local_path = '/tmp/other', observed_at = 'later';
    UPDATE review_log SET local_path = '/tmp/review', observed_at = 'later';`);

  const result = await selectDesktopFramedSyncRelationReviewFacts({
    difference, port, readCurrentInventoryEntry: (tx) => readEntry(tx)
  });

  expect(result.kind).toBe('selected');
  if (result.kind !== 'selected') throw new Error('selection_missing');
  expect(result.facts.map((fact) => [fact.kind, fact.factId])).toEqual([
    [3, desktopFramedSyncParentRelationFactId({
      ordinal: 0, parent_version_id: 'version-parent', version_id: 'version-child'
    })],
    [4, 'review-op-1']
  ]);
  expect(restoreDesktopFramedSyncParentRelation(result.facts[0]!)).toEqual({
    object_id: 'node-1', ordinal: 0,
    parent_version_id: 'version-parent', version_id: 'version-child'
  });
  expect(restoreDesktopFramedSyncReview(result.facts[1]!)).toMatchObject({
    grade: 3, node_id: 'node-1', op_id: 'review-op-1', stability_after: 4.5
  });
  expect(await port.transaction(readEntry)).toEqual(local);
});

it('defers the whole object when a shared review field changes after inventory', async () => {
  const { difference } = await frozenDifference();
  sqlite.prepare("UPDATE review_log SET grade = 4 WHERE op_id = 'review-op-1'").run();

  await expect(selectDesktopFramedSyncRelationReviewFacts({
    difference, port, readCurrentInventoryEntry: (tx) => readEntry(tx)
  })).resolves.toEqual({ globalId: 'node-1', kind: 'deferred', objectType: 'node' });
});

it('never returns a partial set when a requested fact disappears', async () => {
  const { difference, local } = await frozenDifference();
  sqlite.prepare("DELETE FROM node_sync_version_parents WHERE version_id = 'version-child'").run();

  const result = await selectDesktopFramedSyncRelationReviewFacts({
    difference, port, readCurrentInventoryEntry: async () => local
  });

  expect(result).toEqual({ globalId: 'node-1', kind: 'deferred', objectType: 'node' });
  expect(result).not.toHaveProperty('facts');
});
