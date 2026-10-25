// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { closeLibraries, createPeer, joinPeers, root, startLibraries, type Peer } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('converges nonempty libraries to the topic, resource ownership, body, reading, and review union without claiming resource bytes', async () => {
  const a = createPeer('a'); const b = createPeer('b');
  joinPeers(a, b);
  insertLibraryFacts(a, 'a'); insertLibraryFacts(b, 'b');
  await withLibraryRequestSnapshot(a, b, async toB => {
    await withLibraryRequestSnapshot(b, a, async toA => {
      await toA(); await toB();
      const before = [readSummary(a), readSummary(b)];
      await toA(); await toB();
      expect([readSummary(a), readSummary(b)]).toEqual(before);
    });
  });
  const summaryA = readSummary(a);
  expect(summaryA).toEqual(readSummary(b));
  expect(summaryA).toEqual({
    resources: ['a', 'b'].map(suffix => ({ id: `topic-${suffix}`, resource_references: [
      { storage_key: `${suffix.repeat(64)}.png`, original_name: `${suffix}.png`, role: 'reference' }
    ] })),
    bodies: [{ id: 'topic-a', body_text: 'Body a' }, { id: 'topic-b', body_text: 'Body b' }],
    nodeIds: ['topic-a', 'topic-b'], readingIds: ['topic-a', 'topic-b'],
    reviewIds: ['topic-a', 'topic-b'], reviewOps: ['op-a', 'op-b']
  });
  for (const peer of [a, b]) {
    const db = new Database(peer.file, { readonly: true });
    try {
      expect(readSummary({ db })).toEqual(summaryA);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('attachments', 'node_attachments')").all()).toEqual([]);
    } finally { db.close(); }
  }
  for (const suffix of ['a', 'b']) {
    expect((await resolveAttachmentFile(`${suffix.repeat(64)}.png`, path.join(root, 'assets'))).status).toBe('missing_file');
  }
});

function insertLibraryFacts(peer: Peer, suffix: 'a' | 'b') {
  const db = peer.db;
  const nodeId = `topic-${suffix}`;
  const versionId = `${suffix}#1`;
  const createdAt = `2026-08-14T02:0${suffix === 'a' ? 1 : 2}:00.000Z`;
  const resources = JSON.stringify([{ storage_key: `${suffix.repeat(64)}.png`, original_name: `${suffix}.png`, role: 'reference' }]);
  db.prepare(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, content,
       resource_references, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, '', ?, ?, ?)`
  ).run(nodeId, `Topic ${suffix.toUpperCase()}`, resources, createdAt, createdAt);
  const driver = peer.driver;
  writeNodeBody({ driver, nodeId, content: `Body ${suffix}`, title: `Topic ${suffix.toUpperCase()}`, updatedAt: createdAt });
  expect(flushNodeSyncVersionWithDriver(driver, nodeId, `${suffix}-device`, createdAt, versionId)).toBe(versionId);
  db.prepare(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, repetition_count, state
     ) VALUES (?, 60000, 1.5, ?, ?, 0, 1, 'active')`
  ).run(nodeId, createdAt, createdAt);
  db.prepare(
    `INSERT INTO node_review (
       node_id, due, last_review_at, state, stability, difficulty,
       elapsed_days, scheduled_days, reps, lapses
     ) VALUES (?, ?, ?, 2, 2, 3, 1, 1, 1, 0)`
  ).run(nodeId, createdAt, createdAt);
  db.prepare(
    `INSERT INTO review_log (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at) VALUES (?, ?, ?, ?, 3, 'ts-fsrs@4', ?)`
  ).run(`log-${suffix}`, `op-${suffix}`, `${suffix}-device`, nodeId, createdAt);
  insertStates(peer, suffix, nodeId, createdAt);
}

function insertStates(peer: Peer, suffix: string, nodeId: string, at: string) {
  for (const objectType of ['node_reading', 'node_review'] as const) {
    upsertSyncObjectState(peer.driver, {
      objectType, objectId: nodeId,
      contentHash: hashTextBody(`${objectType}-${suffix}`), lastModifiedByHostName: `${suffix}-device`,
      updatedAt: at, syncDirty: true
    });
  }
}

function readSummary(peer: Pick<Peer, 'db'>) {
  const db = peer.db;
  const ids = (sql: string) => (db.prepare(sql).all() as Array<{ id: string }>).map((row) => row.id);
  return {
    resources: db.prepare<[], { id: string; resource_references: string }>(
      "SELECT id, resource_references FROM nodes WHERE id LIKE 'topic-%' ORDER BY id").all()
      .map(row => ({ ...row, resource_references: JSON.parse(row.resource_references) })),
    bodies: db.prepare(`SELECT n.id, v.body_text FROM nodes n JOIN node_sync_versions v
      ON v.version_id = n.current_version_id WHERE n.id LIKE 'topic-%' ORDER BY n.id`).all(),
    nodeIds: ids(`SELECT id FROM nodes WHERE id LIKE 'topic-%' ORDER BY id`),
    readingIds: ids('SELECT node_id AS id FROM node_reading ORDER BY node_id'),
    reviewIds: ids('SELECT node_id AS id FROM node_review ORDER BY node_id'),
    reviewOps: ids('SELECT op_id AS id FROM review_log ORDER BY op_id')
  };
}
