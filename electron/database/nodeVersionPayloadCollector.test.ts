// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  confirmOutboundNodeVersionPack,
  stageOutboundNodeVersionHolds
} from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadMergeBase } from '../../lib/core/sync/syncNodeGraph.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let sqlite: Database.Database;
let port: DbPort;

beforeEach(() => {
  sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  port = createBetterSqliteDbPort(sqlite);
  sqlite.exec(`
    INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'local', 'anchor-local', '/local', 'Local', 'mac', 'active', 'now', 'now'),
        ('group', 'remote', 'anchor-remote', '/remote', 'Remote', 'android', 'active', 'now', 'now');
    INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES ('node', 'topic', 'Node', 'E', 'now', 'now');
  `);
  for (const [index, id] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    const parent = index ? ['A', 'B', 'C', 'D'][index - 1] : null;
    sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node', ?, 'local', ?, ?, ?, ?)`).run(
      id, parent, `2026-09-27T00:00:0${index}Z`, `hash-${id}`, `body-${id}`,
      JSON.stringify({ id: 'node', content: `body-${id}` })
    );
    if (parent) sqlite.prepare(`INSERT INTO node_sync_version_parents VALUES (?, ?, 0)`).run(id, parent);
  }
});

afterEach(() => sqlite.close());

function proveBase(versionId: string) {
  sqlite.prepare(`INSERT OR IGNORE INTO node_version_device_revisions VALUES
    ('group', 'remote', 'epoch', 1, 'pack-1', NULL, 'now')`).run();
  sqlite.prepare(`INSERT INTO node_version_device_bases VALUES
    ('group', 'remote', 'node', ?, 'epoch', 1, 'pack-1', 'now')`).run(versionId);
}

async function stagePackAtA() {
  sqlite.prepare("UPDATE nodes SET current_version_id = 'A' WHERE id = 'node'").run();
  try {
    await stageOutboundNodeVersionHolds(port, { createdAt: 'now', deviceId: 'remote', groupId: 'group',
      heads: [{ objectId: 'node', versionId: 'A' }], packId: 'pack-1' });
  } finally {
    sqlite.prepare("UPDATE nodes SET current_version_id = 'E' WHERE id = 'node'").run();
  }
}

function payloads() {
  return sqlite.prepare(`SELECT version_id, body_text,
    json_extract(snapshot_json, '$.content') AS snapshot_content, parent_version_id
    FROM node_sync_versions ORDER BY version_id`).all();
}

it('keeps an offline A base and current E while stripping intermediate payloads', async () => {
  proveBase('A');
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 3, skipped: null });
  expect(payloads()).toEqual([
    { version_id: 'A', body_text: 'body-A', snapshot_content: 'body-A', parent_version_id: null },
    ...['B', 'C', 'D'].map((id, index) => ({ version_id: id, body_text: null,
      snapshot_content: null, parent_version_id: ['A', 'B', 'C'][index] })),
    { version_id: 'E', body_text: 'body-E', snapshot_content: 'body-E', parent_version_id: 'D' }
  ]);
  expect(await isStoredAncestorVersion(port, 'A', 'E')).toBe(true);
});

it('keeps the common merge base when a peer base is on a sibling branch', async () => {
  sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('F', 'node', 'B', 'remote', 'later', 'hash-F', 'body-F',
      '{"id":"node","content":"body-F"}');
    INSERT INTO node_sync_version_parents VALUES ('F', 'B', 0);`);
  proveBase('F');

  expect((await loadMergeBase(port, 'F', 'E'))?.version_id).toBe('B');
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 3, skipped: null });
  expect(payloads().filter((row) => (row as { body_text: string | null }).body_text !== null)
    .map((row) => (row as { version_id: string }).version_id)).toEqual(['B', 'E', 'F']);
});

it('keeps all payloads when an active device has no exact base proof', async () => {
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: 'peer_base_unknown' });
  expect(payloads().every((row) => (row as { body_text: string }).body_text !== null)).toBe(true);
});

it('keeps an in-flight version alongside the device base and current head', async () => {
  proveBase('A');
  sqlite.prepare(`INSERT INTO node_version_outbound_holds VALUES
    ('pack-2', 'group', 'remote', 'node', 'C', 'now')`).run();
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 2, skipped: null });
  expect(payloads().filter((row) => (row as { body_text: string | null }).body_text !== null)
    .map((row) => (row as { version_id: string }).version_id)).toEqual(['A', 'C', 'E']);
});

it('holds every full payload in a pack until its exact node receipt', async () => {
  proveBase('A');
  await stageOutboundNodeVersionHolds(port, {
    createdAt: 'now', deviceId: 'remote', groupId: 'group',
    heads: [{ objectId: 'node', versionId: 'E' }],
    packId: 'pack-2', payloads: [{ objectId: 'node', versionId: 'C' }]
  });
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 2, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('C'))
    .toEqual({ body_text: 'body-C' });

  await confirmOutboundNodeVersionPack(port, {
    confirmedAt: 'later', deviceId: 'remote', groupId: 'group', libraryEpoch: 'epoch',
    packId: 'pack-2', proofRevision: 2,
    results: [{ baseVersionId: 'A', objectId: 'node', result: 'applied', sentVersionId: 'E' }]
  });
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 1, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('C'))
    .toEqual({ body_text: null });
});

it('keeps a pending edit base and a conflict reference', async () => {
  proveBase('A');
  sqlite.prepare(`INSERT INTO node_version_local_holds VALUES ('editor-1', 'node', 'B', 'now')`).run();
  sqlite.prepare(`INSERT INTO node_sync_conflicts
    (conflict_version_id, object_id, snapshot_json, detected_at)
    VALUES ('D', 'node', '{}', 'now')`).run();

  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 1, skipped: null });
  expect(payloads().filter((row) => (row as { body_text: string | null }).body_text !== null)
    .map((row) => (row as { version_id: string }).version_id)).toEqual(['A', 'B', 'D', 'E']);
});

it('protects a version referenced by another node anchor', async () => {
  proveBase('A');
  sqlite.prepare(`INSERT INTO nodes
    (id, kind, title, anchor_source_version_id, created_at, updated_at)
    VALUES ('child', 'topic', 'Child', 'C', 'now', 'now')`).run();

  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 2, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('C'))
    .toEqual({ body_text: 'body-C' });
});

it('still selects a newer protected merge base across stripped intermediates', async () => {
  proveBase('B');
  await collectNodeVersionPayloads(port, 'node');
  sqlite.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('offline', 'node', 'B', 'remote', 'later', 'offline-hash', 'offline-body',
      '{"id":"node","content":"offline-body"}')`).run();
  sqlite.prepare(`INSERT INTO node_sync_version_parents VALUES ('offline', 'B', 0)`).run();

  expect((await loadMergeBase(port, 'offline', 'E'))?.version_id).toBe('B');
});

it('rolls the entire node back when an update fails', async () => {
  proveBase('A');
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
  await expect(collectNodeVersionPayloads(failingPort, 'node')).rejects.toThrow('injected_failure');
  expect(payloads().every((row) => (row as { body_text: string }).body_text !== null)).toBe(true);
});

it('advances a peer base only from an exact applied pack receipt', async () => {
  await stagePackAtA();
  const ack = { confirmedAt: 'later', deviceId: 'remote', groupId: 'group',
    libraryEpoch: 'epoch', packId: 'pack-1', proofRevision: 1,
    results: [{ baseVersionId: 'A', objectId: 'node', result: 'applied' as const, sentVersionId: 'A' }] };
  await confirmOutboundNodeVersionPack(port, ack);
  await confirmOutboundNodeVersionPack(port, ack);

  expect(sqlite.prepare(`SELECT version_id, pack_id FROM node_version_device_bases`).all())
    .toEqual([{ version_id: 'A', pack_id: 'pack-1' }]);
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 3, skipped: null });
});

it('does not infer a peer base from a tombstone-blocked node in an acknowledged pack', async () => {
  await stagePackAtA();
  await confirmOutboundNodeVersionPack(port, { confirmedAt: 'later', deviceId: 'remote',
    groupId: 'group', libraryEpoch: 'epoch', packId: 'pack-1', proofRevision: 1,
    results: [{ baseVersionId: null, objectId: 'node', result: 'blocked', sentVersionId: 'A' }] });

  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: 'peer_base_unknown' });
});

it('keeps an unconfirmed hold after an ack names the wrong version', async () => {
  await stagePackAtA();
  await expect(confirmOutboundNodeVersionPack(port, { confirmedAt: 'later', deviceId: 'remote',
    groupId: 'group', libraryEpoch: 'epoch', packId: 'pack-1', proofRevision: 1,
    results: [{ baseVersionId: 'B', objectId: 'node', result: 'applied', sentVersionId: 'B' }] }))
    .rejects.toThrow('node_version_pack_hold_missing');
  expect(sqlite.prepare('SELECT version_id FROM node_version_outbound_holds').all())
    .toEqual([{ version_id: 'A' }]);
});
