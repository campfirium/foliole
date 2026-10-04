// @vitest-environment node

import { expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  confirmOutboundNodeVersionPack,
  stageOutboundNodeVersionHolds
} from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { isStoredAncestorVersion, loadMergeBase } from '../../lib/core/sync/syncNodeGraph.js';

import { port, proveBase, setupVersionCollectionFixture,
  sqlite } from './nodeVersionPayloadCollector.testSupport.js';

setupVersionCollectionFixture();

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

it('keeps offline and current bodies while preserving original intermediate identities and edges', async () => {
  proveBase('A');
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 3, skipped: null });
  expect(payloads()).toEqual([
    { version_id: 'A', body_text: 'body-A', snapshot_content: 'body-A', parent_version_id: null },
    { version_id: 'B', body_text: null, snapshot_content: null, parent_version_id: 'A' },
    { version_id: 'C', body_text: null, snapshot_content: null, parent_version_id: 'B' },
    { version_id: 'D', body_text: null, snapshot_content: null, parent_version_id: 'C' },
    { version_id: 'E', body_text: 'body-E', snapshot_content: 'body-E', parent_version_id: 'D' }
  ]);
  expect(await isStoredAncestorVersion(port, 'A', 'E')).toBe(true);
  expect(sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all())
    .toEqual(['B', 'C', 'D', 'E'].map((id, index) => ({ version_id: id,
      parent_version_id: ['A', 'B', 'C', 'D'][index], ordinal: 0 })));
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
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

it('keeps the inherited complete chain until direct device dependencies are known', async () => {
  sqlite.exec('DELETE FROM node_version_local_origins');
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
  expect(payloads().every((row) => (row as { body_text: string }).body_text !== null)).toBe(true);
});

it('keeps an unabsorbed sibling and its base without a direct member declaration', async () => {
  proveBase('A');
  sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json)
    VALUES ('hidden', 'node', 'B', 'remote', 'later', 'hidden-hash', 'hidden-body',
      '{"id":"node","content":"hidden-body"}');
    INSERT INTO node_sync_version_parents VALUES ('hidden', 'B', 0);`);
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 2, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('B'))
    .toEqual({ body_text: 'body-B' });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('hidden'))
    .toEqual({ body_text: 'hidden-body' });
  expect((await loadMergeBase(port, 'hidden', 'E'))?.version_id).toBe('B');
});

it('keeps an in-flight version alongside the device base and current head', async () => {
  proveBase('A');
  sqlite.prepare(`INSERT INTO node_version_outbound_holds VALUES
    ('pack-2', 'group', 'remote', 'node', 'C', 'now')`).run();
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 1, skipped: null });
  expect(payloads().filter((row) => (row as { body_text: string | null }).body_text !== null)
    .map((row) => (row as { version_id: string }).version_id)).toEqual(['A', 'B', 'C', 'E']);
});

it('holds every full payload in a pack until its exact node receipt', async () => {
  proveBase('A');
  await stageOutboundNodeVersionHolds(port, {
    createdAt: 'now', deviceId: 'remote', groupId: 'group',
    heads: [{ objectId: 'node', versionId: 'E' }],
    packId: 'pack-2', payloads: [{ objectId: 'node', versionId: 'C' }]
  });
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('C'))
    .toEqual({ body_text: 'body-C' });

  await confirmOutboundNodeVersionPack(port, {
    confirmedAt: 'later', deviceId: 'remote', groupId: 'group', libraryEpoch: 'epoch',
    packId: 'pack-2', proofRevision: 2,
    results: [{ baseVersionId: 'A', objectId: 'node', result: 'applied', sentVersionId: 'E' }]
  });
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('C')).toEqual({ body_text: null });
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

it('protects an editor base until its hold is released', async () => {
  proveBase('A');
  await port.transaction((tx) => retainLocalEditBase(tx, {
    holdId: 'editor-1', nodeId: 'node', versionId: 'B'
  }));
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 2, skipped: null });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('B'))
    .toEqual({ body_text: 'body-B' });
  await releaseLocalEditBase(port, 'editor-1', 'node');
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
  await expect(retainLocalEditBase(port, { holdId: 'late-editor', nodeId: 'node', versionId: 'B' }))
    .rejects.toThrow('content_edit_base_unavailable');
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
  expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
});

it('does not infer a peer base from a tombstone-blocked node in an acknowledged pack', async () => {
  await stagePackAtA();
  await confirmOutboundNodeVersionPack(port, { confirmedAt: 'later', deviceId: 'remote',
    groupId: 'group', libraryEpoch: 'epoch', packId: 'pack-1', proofRevision: 1,
    results: [{ baseVersionId: null, objectId: 'node', result: 'blocked', sentVersionId: 'A' }] });

  expect(sqlite.prepare('SELECT * FROM node_version_device_bases').all()).toEqual([]);
  expect(sqlite.prepare('SELECT version_id FROM node_version_outbound_holds').all()).toEqual([{ version_id: 'A' }]);
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
