// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { restoreNodes, softDeleteNodes } from '../../lib/core/database/nodeMutations.js';
import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { framedSyncParentRelationFactId } from '../../lib/core/sync/framedSyncRelationReviewFact.js';
import { projectDesktopFramedSyncParentRelation, projectDesktopFramedSyncReview } from '../sync/desktopFramedSyncRelationReviewProjection.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from './desktopFramedSyncRelationReviewApply.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, edit, startLibraries } from './syncEmptyLibraryTestSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

const entry = z.object({ content_hash: z.string(), frontier_json: z.string(),
  object_id: z.string(), relations_json: z.string(), states_json: z.string() });

it('updates durable inventory metadata in the production edit transaction', () => {
  const peer = createPeer('writer');
  edit(peer, 'first body');
  const first = entry.parse(peer.db.prepare('SELECT * FROM framed_sync_inventory WHERE object_type = ? AND object_id = ?')
    .get('node', 'topic'));
  expect(first).toMatchObject({ object_id: 'topic' });
  edit(peer, 'second body');
  const current = entry.parse(peer.db.prepare('SELECT * FROM framed_sync_inventory WHERE object_type = ? AND object_id = ?')
    .get('node', 'topic'));
  expect(current).not.toEqual(first);
  const versions = peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE object_id = ? ORDER BY version_id')
    .all('topic');
  expect(JSON.parse(current.frontier_json)).toEqual(versions.map((row) => z.object({ version_id: z.string() }).parse(row).version_id));
  const parents = peer.db.prepare(`SELECT parent.* FROM node_sync_version_parents parent
    JOIN node_sync_versions version ON version.version_id = parent.version_id WHERE version.object_id = ?
    ORDER BY parent.version_id, parent.parent_version_id, parent.ordinal`).all('topic');
  expect(JSON.parse(current.relations_json)).toEqual(parents.map((row) => framedSyncParentRelationFactId(z.object({ version_id: z.string(),
    parent_version_id: z.string(), ordinal: z.number() }).parse(row))).sort());
});

it('records reading-only state without changing the Node hash', () => {
  const peer = createPeer('reader');
  edit(peer, 'body');
  const query = peer.db.prepare("SELECT * FROM framed_sync_inventory WHERE object_type = 'node' AND object_id = 'topic'");
  const before = entry.parse(query.get());
  saveNodeReadingStateWithSync(peer.driver, { nodeId: 'topic', hostName: peer.name,
    reading: { intervalDurationMs: 1000, intervalGrowthFactor: 2, lastHandledAt: '2026-10-06',
      nextAt: '2026-10-07', priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' },
    updatedAt: '2026-10-06' });
  const after = entry.parse(query.get());
  expect(after.content_hash).toBe(before.content_hash);
  const state = z.object({ content_hash: z.string() }).parse(peer.db.prepare(
    "SELECT content_hash FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'topic'").get());
  expect(JSON.parse(after.states_json)).toEqual(['node_reading:' + state.content_hash]);
});

function traceQueries(port: DbPort, sql: string[]): DbPort {
  return {
    run: (statement, params) => port.run(statement, params),
    query: <T extends DbRow>(statement: string, params?: Parameters<DbPort['query']>[1]) => {
      sql.push(statement);
      return port.query<T>(statement, params);
    },
    transaction: (execute) => port.transaction((tx) => execute(traceQueries(tx, sql)))
  };
}

it('reads an unchanged production library without loading body, resource JSON or business facts', async () => {
  const peer = createPeer('discovery-reader');
  edit(peer, 'A nonempty production body');
  const statements: string[] = [];
  const inventory = await readFramedSyncInventory(traceQueries(peer.port, statements));
  expect(inventory).toContainEqual(expect.objectContaining({ globalId: 'topic', objectType: 'node' }));
  expect(statements.join('\n')).not.toMatch(/\b(body_text|snapshot_json|resource_references|node_sync_versions|node_sync_version_parents|review_log)\b/u);
});


it('discovers independently applied parent and review facts without changing the Node hash', async () => {
  const peer = createPeer('independent-writer');
  const first = edit(peer, 'first');
  edit(peer, 'second');
  const head = edit(peer, 'third');
  const read = async () => (await readFramedSyncInventory(peer.port)).find((item) => item.objectType === 'node')!;
  const before = await read();
  const relation = projectDesktopFramedSyncParentRelation({ object_id: 'topic', ordinal: 1,
    version_id: head, parent_version_id: first });
  const review = projectDesktopFramedSyncReview({ id: 'review-row', op_id: 'independent-review', node_id: 'topic',
    host_name: peer.name, grade: 3, scheduler_version: 'fsrs-6', reviewed_at: '2026-10-06',
    due_before: '2026-10-05', due_after: '2026-10-07', stability_before: 2, stability_after: 3,
    difficulty_before: 2, difficulty_after: 3 });
  await peer.port.transaction((tx) => applyDesktopFramedSyncRelationReviewFactsWithDbPort(tx, [relation, review]));
  const after = await read();
  expect(after.sharedStateHash).toEqual(before.sharedStateHash);
  expect(after.requiredRelationIds).toContain(relation.factId);
  expect(after.reviewFactIds).toContain(review.factId);
  expect(before.requiredRelationIds).not.toContain(relation.factId);
  expect(before.reviewFactIds).not.toContain(review.factId);
});

it('updates inventory for production deletion and restoration versions', async () => {
  const peer = createPeer('delete-restore');
  const initial = edit(peer, 'Original body');
  softDeleteNodes(peer.driver, { nodeIds: ['topic'], deletedAt: '2026-10-06T01:00:00.000Z' });
  peer.driver.execute('UPDATE nodes SET sync_dirty = 1 WHERE id = ?', ['topic']);
  const deleted = flushNodeSyncVersionWithDriver(peer.driver, 'topic', peer.name, '2026-10-06T01:00:00.000Z')!;
  expect(deleted).not.toBeNull();
  expect(deleted).not.toBe(initial);
  const deletionInventory = await readFramedSyncInventory(peer.port);
  expect(deletionInventory.find((item) => item.objectType === 'node')!.frontierFactIds).toContain(deleted);
  restoreNodes(peer.driver, { nodeIds: ['topic'] });
  peer.driver.execute('UPDATE nodes SET sync_dirty = 1 WHERE id = ?', ['topic']);
  const restored = flushNodeSyncVersionWithDriver(peer.driver, 'topic', peer.name, '2026-10-06T02:00:00.000Z')!;
  const restoredInventory = await readFramedSyncInventory(peer.port);
  expect(restoredInventory).not.toEqual(deletionInventory);
  expect(restoredInventory.find((item) => item.objectType === 'node')!.frontierFactIds).toContain(restored);
});

it('initializes a pre-index library only through the numbered migration and preserves facts after reopen', async () => {
  const peer = createPeer('migration');
  edit(peer, 'First original fact');
  edit(peer, 'Second original fact');
  const expected = await readFramedSyncInventory(peer.port);
  const facts = peer.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const triggers = peer.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_framed_inventory_%'")
    .pluck().all() as string[];
  for (const trigger of triggers) peer.db.exec(`DROP TRIGGER ${trigger}`);
  for (const table of ['framed_sync_inventory', 'framed_sync_fact_summary', 'framed_sync_version_summary', 'framed_sync_resource_availability']) {
    peer.db.exec(`DROP TABLE ${table}`);
  }
  peer.db.pragma('user_version = 140');
  initializeDatabaseSchema(peer.db);
  expect(peer.db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(facts);
  const reopened = new Database(peer.file, { readonly: true });
  try { expect(await readFramedSyncInventory(createBetterSqliteDbPort(reopened))).toEqual(expected); }
  finally { reopened.close(); }
});
