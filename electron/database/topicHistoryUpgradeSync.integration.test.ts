// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord, loadRetainedSyncNodeVersionFact } from '../../lib/core/sync/syncNodeGraph.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';

import { legacyHistoryRuntime } from './legacyHistoryRuntime.testSupport.js';
import { assertPersisted, closeLibraries, createPeer, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { withLibraryRequestSnapshot } from './syncRequestSnapshot.testSupport.js';
import { textBranch } from './topicTextState.testSupport.js';

let legacy: Awaited<ReturnType<typeof legacyHistoryRuntime>>;
beforeAll(async () => { legacy = await legacyHistoryRuntime(); });
afterAll(async () => { await legacy.close(); });
beforeEach(startLibraries);
afterEach(closeLibraries);
const key = { globalId: 'topic', objectType: 'node' };

async function oldPeers() {
  const a = createPeer('a', legacy.runtime.initializeDatabaseSchema);
  const b = createPeer('b', legacy.runtime.initializeDatabaseSchema);
  joinPeers(a, b);
  const v1 = textBranch('v1', 'Original');
  const v2 = textBranch('v2', 'Intermediate', v1);
  const v3 = textBranch('v3', 'Current complete body', v2);
  for (const peer of [a, b]) {
    await applyConvergentSyncNodesWithDbPort(peer.port, [v1, v2, v3], { collectVersionPayloads: false });
    peer.db.exec(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id IN ('v1', 'v2')`);
  }
  return { a, b };
}

it('rejects mixed summary protocols during rolling upgrades and completes after both upgrade', async () => {
  const { a, b } = await oldPeers();
  expect((await readFramedSyncInventoryEntry(b.port, key))!.unready).toBe(true);
  initializeDatabaseSchema(a.db);
  expect(evaluateSyncProtocolCompatibility(legacy.runtime.CURRENT_SYNC_PROTOCOL_DESCRIPTOR))
    .toMatchObject({ status: 'incompatible', reason: 'protocol_version_unsupported' });
  expect(legacy.runtime.evaluateSyncProtocolCompatibility(CURRENT_SYNC_PROTOCOL_DESCRIPTOR))
    .toMatchObject({ status: 'incompatible', reason: 'protocol_version_unsupported' });
  assertPersisted(b, 'Current complete body', 'v3');
  expect((await readFramedSyncInventoryEntry(b.port, key))!.unready).toBe(true);
  initializeDatabaseSchema(b.db);
  for (const [source, target] of [[b, a], [a, b]] as const) {
    await withLibraryRequestSnapshot(source, target, replay => replay());
  }
  const entries = await Promise.all([a, b].map(peer => readFramedSyncInventoryEntry(peer.port, key)));
  expect(compareFramedSyncInventories({ local: [entries[0]!], remote: [entries[1]!] })).toEqual([]);
  for (const peer of [a, b]) {
    assertPersisted(peer, 'Current complete body', 'v3');
    expect(peer.db.prepare(`SELECT version_id FROM node_sync_versions WHERE
      json_extract(snapshot_json, '$.body_deleted') = 1 ORDER BY version_id`).all())
      .toEqual([{ version_id: 'v1' }, { version_id: 'v2' }]);
  }
});

it('keeps two preexisting complete equal-body heads and their adopted pointer while retiring their history', async () => {
  const { a, b } = await oldPeers();
  const current = (await loadCurrentSyncNodeRecord(a.port, 'topic'))!;
  const extra = { ...current, version_id: 'extra-head', content_hash: 'e'.repeat(64),
    updated_at: '2026-10-15T00:00:00Z', version_created_at: '2026-10-15T00:00:00Z',
    snapshot: { ...current.snapshot, updated_at: '2026-10-15T00:00:00Z' } };
  for (const peer of [a, b]) await upsertRemoteVersion(peer.port, extra);
  initializeDatabaseSchema(a.db);
  initializeDatabaseSchema(b.db);
  await withLibraryRequestSnapshot(a, b, replay => replay());
  for (const peer of [a, b]) {
    assertPersisted(peer, 'Current complete body', 'v3');
    expect(peer.db.prepare('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL ORDER BY version_id').all())
      .toEqual([{ version_id: 'extra-head' }, { version_id: 'v3' }]);
    expect((await loadCurrentSyncNodeRecord(peer.port, 'topic'))!.snapshot.text_alternatives).toEqual([]);
  }
});

it('preserves original body hashes when both old libraries upgrade before exchanging current requests', async () => {
  const { a, b } = await oldPeers();
  for (const peer of [a, b]) peer.db.exec(`UPDATE node_sync_versions SET body_text = 'Original',
    snapshot_json = json_remove(snapshot_json, '$.body_blob_hash') WHERE version_id = 'v1'`);
  initializeDatabaseSchema(a.db);
  initializeDatabaseSchema(b.db);
  expect((await loadRetainedSyncNodeVersionFact(b.port, 'v1'))!.snapshot.body_deleted).toBe(true);
  expect((await loadRetainedSyncNodeVersionFact(b.port, 'v1'))!.snapshot.body_blob_hash).toBe(hashTextBody('Original'));
  await withLibraryRequestSnapshot(a, b, replay => replay());
  expect((await loadRetainedSyncNodeVersionFact(b.port, 'v1'))!).toMatchObject({ body_text: null,
    snapshot: { body_deleted: true, body_blob_hash: hashTextBody('Original') } });
  const entries = await Promise.all([a, b].map(peer => readFramedSyncInventoryEntry(peer.port, key)));
  expect(compareFramedSyncInventories({ local: [entries[0]!], remote: [entries[1]!] })).toEqual([]);
  assertPersisted(b, 'Current complete body', 'v3');
});

it('protects a still-current old version until the complete descendant is adopted', async () => {
  const { a, b } = await oldPeers();
  b.db.exec(`DELETE FROM node_sync_version_parents; DELETE FROM node_sync_versions WHERE version_id <> 'v1';
    UPDATE node_sync_versions SET body_text = 'Original', snapshot_json = json_set(snapshot_json, '$.content', 'Original');
    UPDATE nodes SET current_version_id = 'v1', content = 'Original';
    UPDATE sync_object_state SET current_version_id = 'v1' WHERE object_type = 'node' AND object_id = 'topic'`);
  initializeDatabaseSchema(a.db);
  initializeDatabaseSchema(b.db);
  expect((await loadCurrentSyncNodeRecord(b.port, 'topic'))!.body_text).toBe('Original');
  await withLibraryRequestSnapshot(a, b, replay => replay());
  assertPersisted(b, 'Current complete body', 'v3');
  expect(b.db.prepare("SELECT body_text, json_extract(snapshot_json, '$.body_deleted') AS retired FROM node_sync_versions WHERE version_id = 'v1'").get())
    .toEqual({ body_text: null, retired: 1 });
});

it('collects only after all object facts and state, returns the final digest, and atomically rolls back failure', async () => {
  const { a, b } = await oldPeers();
  initializeDatabaseSchema(a.db);
  const before = ['node_sync_versions', 'node_sync_version_parents', 'nodes', 'sync_object_state',
    'node_version_member_positions', 'framed_sync_inventory'];
  const state = () => before.map(table => b.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  const original = state();
  let sawHistoryBeforeTail = false;
  let returnedHash: Uint8Array | undefined;
  const intercept: typeof applyRequestSyncObject = (db, input) => applyRequestSyncObject(db, { ...input,
    facts: async function* (tx, kinds) {
      if (kinds?.includes(1)) {
        const row = b.db.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'v1'").pluck().get();
        expect(JSON.parse(String(row)).body_deleted).not.toBe(true);
        sawHistoryBeforeTail = true;
      }
      yield* input.facts(tx, kinds);
    } });
  await withLibraryRequestSnapshot(a, b, async replay => {
    b.db.exec(`CREATE TRIGGER fail_tail BEFORE UPDATE ON node_sync_versions
      WHEN json_extract(NEW.snapshot_json, '$.body_deleted') = 1
      BEGIN SELECT RAISE(ABORT, 'injected_tail_failure'); END`);
    await expect(replay()).rejects.toThrow('injected_tail_failure');
    expect(state()).toEqual(original);
    b.db.exec('DROP TRIGGER fail_tail');
    await replay();
  }, { writeRequestSyncSnapshot, applyRequestSyncObject: async (db, input) => {
    const result = await intercept(db, input); returnedHash = result.sharedStateHash; return result;
  } });
  expect(sawHistoryBeforeTail).toBe(true);
  expect(returnedHash).toEqual((await readFramedSyncInventoryEntry(b.port, key))!.sharedStateHash);
  expect((await loadCurrentSyncNodeRecord(b.port, 'topic'))!.body_text).toBe('Current complete body');
});
