// @vitest-environment node

import { expect, it } from 'vitest';

import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadMergeBase } from '../../lib/core/sync/syncNodeGraph.js';

import { port, seedPeerProof, setupVersionCollectionFixture,
  sqlite } from './nodeVersionPayloadCollector.testSupport.js';

setupVersionCollectionFixture();

function payloads() {
  return sqlite.prepare(`SELECT version_id, body_text,
    json_extract(snapshot_json, '$.content') AS snapshot_content, parent_version_id
    FROM node_sync_versions ORDER BY version_id`).all();
}

function facts() {
  return { versions: sqlite.prepare(`SELECT version_id, object_id, parent_version_id, host_name, created_at,
    content_hash, json_remove(snapshot_json, '$.content', '$.body_deleted', '$.body_blob_hash',
      '$.text_alternative_bodies') AS metadata FROM node_sync_versions ORDER BY version_id`).all(),
  parents: sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all() };
}

async function collect(db: DbPort = port) {
  const before = facts();
  const bodies = sqlite.prepare<[], { version_id: string; body_text: string | null }>(
    'SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all();
  const result = await collectNodeVersionPayloads(db, 'node');
  expect(facts()).toEqual(before);
  for (const row of bodies) {
    const after = sqlite.prepare<[string], { body_text: string | null; hash: string | null; retired: number }>(
      `SELECT body_text, json_extract(snapshot_json, '$.body_blob_hash') AS hash,
        json_extract(snapshot_json, '$.body_deleted') AS retired FROM node_sync_versions WHERE version_id = ?`).get(row.version_id);
    if (row.body_text !== null && after?.body_text === null) {
      expect(after).toEqual({ body_text: null, hash: hashTextBody(row.body_text), retired: 1 });
    }
  }
  return result;
}

it('retires offline ancestor copies while preserving current text, identities and edges', async () => {
  seedPeerProof();
  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(payloads()).toEqual([
    { version_id: 'A', body_text: null, snapshot_content: null, parent_version_id: null },
    { version_id: 'B', body_text: null, snapshot_content: null, parent_version_id: 'A' },
    { version_id: 'C', body_text: null, snapshot_content: null, parent_version_id: 'B' },
    { version_id: 'D', body_text: null, snapshot_content: null, parent_version_id: 'C' },
    { version_id: 'E', body_text: 'body-E', snapshot_content: 'body-E', parent_version_id: 'D' }
  ]);
  expect(await isStoredAncestorVersion(port, 'A', 'E')).toBe(true);
  expect(sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all())
    .toEqual(['B', 'C', 'D', 'E'].map((id, index) => ({ version_id: id,
      parent_version_id: ['A', 'B', 'C', 'D'][index], ordinal: 0 })));
  expect(await collect()).toEqual({ released: 0, skipped: null });
});

it('keeps sibling branch text and common ancestor identity without retaining its body', async () => {
  sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('F', 'node', 'B', 'remote', 'later', 'hash-F', 'body-F',
      '{"id":"node","content":"body-F"}');
    INSERT INTO node_sync_version_parents VALUES ('F', 'B', 0);`);
  seedPeerProof();

  expect((await loadMergeBase(port, 'F', 'E'))?.version_id).toBe('B');
  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(payloads().filter((row) => (row as { body_text: string | null }).body_text !== null)
    .map((row) => (row as { version_id: string }).version_id)).toEqual(['E', 'F']);
});

it('retires unused ancestor copies without waiting for direct device declarations', async () => {
  sqlite.exec('DELETE FROM node_version_local_origins');
  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(sqlite.prepare('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL').pluck().all()).toEqual(['E']);
});

it('keeps an unabsorbed sibling body and its ancestor identity without a member declaration', async () => {
  seedPeerProof();
  sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('hidden', 'node', 'B', 'remote', 'later', 'hidden-hash', 'hidden-body',
      '{"id":"node","content":"hidden-body"}');
    INSERT INTO node_sync_version_parents VALUES ('hidden', 'B', 0);`);
  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('B'))
    .toEqual({ body_text: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('hidden'))
    .toEqual({ body_text: 'hidden-body' });
  expect((await loadMergeBase(port, 'hidden', 'E'))?.version_id).toBe('B');
});

it('preserves editor and legacy conflict references while retiring unused topic body copies', async () => {
  seedPeerProof();
  sqlite.prepare(`INSERT INTO node_version_local_holds VALUES ('editor-1', 'node', 'B', 'now')`).run();
  sqlite.prepare(`INSERT INTO node_sync_conflicts
    (conflict_version_id, object_id, snapshot_json, detected_at)
    VALUES ('D', 'node', '{}', 'now')`).run();

  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(payloads().filter((row) => (row as { body_text: string | null }).body_text !== null)
    .map((row) => (row as { version_id: string }).version_id)).toEqual(['E']);
  expect(sqlite.prepare('SELECT hold_id, version_id FROM node_version_local_holds').all())
    .toEqual([{ hold_id: 'editor-1', version_id: 'B' }]);
  expect(sqlite.prepare('SELECT conflict_version_id, snapshot_json FROM node_sync_conflicts').all())
    .toEqual([{ conflict_version_id: 'D', snapshot_json: '{}' }]);
});

it('keeps an editor base identity usable after retirement and releases its hold', async () => {
  seedPeerProof();
  await port.transaction((tx) => retainLocalEditBase(tx, {
    holdId: 'editor-1', nodeId: 'node', versionId: 'B'
  }));
  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('B'))
    .toEqual({ body_text: null });
  await releaseLocalEditBase(port, 'editor-1', 'node');
  expect(await collect()).toEqual({ released: 0, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('B')).toEqual({ body_text: null });
  await retainLocalEditBase(port, { holdId: 'late-editor', nodeId: 'node', versionId: 'B' });
});

it('preserves an anchor source identity without retaining its obsolete body copy', async () => {
  seedPeerProof();
  sqlite.prepare(`INSERT INTO nodes
    (id, kind, title, anchor_source_version_id, created_at, updated_at)
    VALUES ('child', 'topic', 'Child', 'C', 'now', 'now')`).run();

  expect(await collect()).toEqual({ released: 4, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('C'))
    .toEqual({ body_text: null });
  expect(sqlite.prepare("SELECT anchor_source_version_id FROM nodes WHERE id = 'child'").get())
    .toEqual({ anchor_source_version_id: 'C' });
});

it('still selects a newer protected merge base across stripped intermediates', async () => {
  seedPeerProof();
  await collect();
  sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('offline', 'node', 'B', 'remote', 'later', 'offline-hash', 'offline-body',
      '{"id":"node","content":"offline-body"}')`).run();
  sqlite.prepare(`INSERT INTO node_sync_version_parents VALUES ('offline', 'B', 0)`).run();

  expect((await loadMergeBase(port, 'offline', 'E'))?.version_id).toBe('B');
});

it('rolls the entire node back when an update fails', async () => {
  seedPeerProof();
  const before = sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  let updates = 0;
  const failingPort: DbPort = {
    query: (sql, params) => port.query(sql, params),
    run: (sql, params) => port.run(sql, params),
    transaction: (execute) => port.transaction((tx) => execute({
      query: (sql, params) => tx.query(sql, params),
      transaction: (nested) => tx.transaction(nested),
      run: (sql, params) => {
        if (sql.startsWith('UPDATE node_sync_versions') && ++updates === 2) throw new Error('injected_failure');
        return tx.run(sql, params);
      }
    })) };
  await expect(collect(failingPort)).rejects.toThrow('injected_failure');
  expect(sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
});
