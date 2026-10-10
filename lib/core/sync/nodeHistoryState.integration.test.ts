// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { migrateNodeHistoryState } from '../database/nodeHistoryStateMigration.js';
import { hashTextBody } from '../database/textBodyHash.js';

import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { stageFramedSyncFrozenBody, loadFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import { readFramedSyncInventoryEntry } from './framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from './framedSyncNodeProjection.js';
import { applyLocalContentEdit } from './localContentEdit.js';
import { retainLocalEditBase } from './nodeVersionLocalEditHold.js';
import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { loadRetainedSyncNodeVersionFact } from './syncNodeGraph.js';
import { restoreIncomingNodeMergeBases } from './syncPackNodeMergeBaseRestore.js';
import { rehydrateStoredVersionBodies, loadVerifiedExistingSyncPackVersions } from './syncPackStoredVersionFacts.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(device => device.sqlite.close()));
const key = { globalId: 'topic', objectType: 'node' };
const v1 = textBranch('v1', 'Original 中文\r\n😀', undefined, '2026-10-10T01:00:00Z');
const v2 = textBranch('v2', 'Current body', v1, '2026-10-10T02:00:00Z');

async function host() {
  const device = textDevice();
  devices.push(device);
  await device.receive([v1, v2]);
  return device;
}

const deletion = { ...v1, body_text: null,
  snapshot: { ...v1.snapshot, content: null, body_deleted: true } };

it('propagates deletion without changing identity or parents and ignores old complete input', async () => {
  const a = await host();
  const before = await readFramedSyncInventoryEntry(a.db, key);
  await upsertRemoteVersion(a.db, deletion);
  const after = await readFramedSyncInventoryEntry(a.db, key);
  expect(after!.sharedStateHash).not.toEqual(before!.sharedStateHash);
  await upsertRemoteVersion(a.db, v1);
  const stored = await loadRetainedSyncNodeVersionFact(a.db, 'v1');
  expect(stored).toMatchObject({ body_text: null, content_hash: v1.content_hash, snapshot: { body_deleted: true } });
  expect((await a.current()).body_text).toBe(v2.body_text);
  expect(a.sqlite.prepare('SELECT * FROM node_sync_version_parents').all())
    .toEqual([{ version_id: 'v2', parent_version_id: 'v1', ordinal: 0 }]);
});

it('protects current text from a historical deletion while preserving an editor input after its base is deleted', async () => {
  const a = await host();
  await retainLocalEditBase(a.db, { holdId: 'editor', nodeId: 'topic', versionId: 'v1' });
  await upsertRemoteVersion(a.db, { ...v2, body_text: null,
    snapshot: { ...v2.snapshot, content: null, body_deleted: true } });
  expect((await a.current()).body_text).toBe(v2.body_text);
  await upsertRemoteVersion(a.db, deletion);
  const input = 'Unsaved full input 中文😀';
  const result = await applyLocalContentEdit(a.db, { baseVersionId: 'v1', versionId: 'offline-edit',
    content: input, hideTitleHeading: false, hostName: 'offline-device', nodeId: 'topic',
    title: 'Topic', updatedAt: '2026-10-10T03:00:00Z' });
  expect(result.submittedVersionId).toBe('offline-edit');
  expect(a.sqlite.prepare('SELECT body_text, parent_version_id FROM node_sync_versions WHERE version_id = ?')
    .get('offline-edit')).toEqual({ body_text: input, parent_version_id: 'v1' });
  expect((await loadRetainedSyncNodeVersionFact(a.db, 'v1'))!.body_text).toBeNull();
});

it('keeps legacy missing bodies unready on both sides and repairs them from a complete fact', async () => {
  const [a, b] = await Promise.all([host(), host()]);
  for (const device of [a, b]) {
    device.sqlite.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`).run('v1');
    migrateNodeHistoryState(device.sqlite);
  }
  const missing = await Promise.all([a, b].map(device => readFramedSyncInventoryEntry(device.db, key)));
  expect(missing.map(entry => entry!.unready)).toEqual([true, true]);
  expect(compareFramedSyncDatabaseInventories({ local: [missing[0]!], remote: [missing[1]!] })).not.toEqual([]);
  for (const device of [a, b]) await upsertRemoteVersion(device.db, v1);
  const repaired = await Promise.all([a, b].map(device => readFramedSyncInventoryEntry(device.db, key)));
  expect(repaired[0]!.unready).toBe(false);
  expect(compareFramedSyncDatabaseInventories({ local: [repaired[0]!], remote: [repaired[1]!] })).toEqual([]);
  expect((await loadRetainedSyncNodeVersionFact(b.db, 'v1'))!.body_text).toBe(v1.body_text);
});

it('rolls back body state and its inventory together if the transaction fails', async () => {
  const a = await host();
  const before = await readFramedSyncInventoryEntry(a.db, key);
  await expect(a.db.transaction(async tx => {
    await upsertRemoteVersion(tx, deletion);
    throw new Error('injected_failure');
  })).rejects.toThrow('injected_failure');
  expect(await readFramedSyncInventoryEntry(a.db, key)).toEqual(before);
  expect((await loadRetainedSyncNodeVersionFact(a.db, 'v1'))!.body_text).toBe(v1.body_text);
});

it('maintains the hash for head-only and parent-only changes and repairs missing parent identities', async () => {
  const a = await host();
  const before = await readFramedSyncInventoryEntry(a.db, key);
  a.sqlite.prepare("UPDATE sync_object_state SET current_version_id = 'v1' WHERE object_type = 'node' AND object_id = 'topic'").run();
  expect((await readFramedSyncInventoryEntry(a.db, key))!.sharedStateHash).not.toEqual(before!.sharedStateHash);
  a.sqlite.prepare("UPDATE sync_object_state SET current_version_id = 'v2' WHERE object_type = 'node' AND object_id = 'topic'").run();
  a.sqlite.prepare("DELETE FROM node_sync_version_parents WHERE version_id = 'v2'").run();
  expect((await readFramedSyncInventoryEntry(a.db, key))!.sharedStateHash).not.toEqual(before!.sharedStateHash);
  await upsertRemoteVersion(a.db, v2);
  expect(await readFramedSyncInventoryEntry(a.db, key)).toEqual(before);
});

it('uses independent frozen bytes after historical deletion and preserves deletion on old input replay', async () => {
  const a = await host();
  const projection = projectFramedSyncNodeRecord(v1);
  const blob = projection.manifest.blobs[0]!;
  await stageFramedSyncFrozenBody(a.db, blob, projection.bodyBlob);
  await upsertRemoteVersion(a.db, deletion);
  expect(Array.from(await loadFramedSyncFrozenBody(a.db, blob))).toEqual(Array.from(projection.bodyBlob));
  await upsertRemoteVersion(a.db, v1);
  expect((await loadRetainedSyncNodeVersionFact(a.db, 'v1'))!.body_text).toBeNull();
});

it('keeps a version unready until every retained complete alternative is restored', async () => {
  const a = await host();
  const hash = hashTextBody('Complete alternative');
  const record = { ...v2, snapshot: { ...v2.snapshot, text_alternatives: [{ id: 'alternative',
    body_blob_hash: hash, source_host_name: 'branch', created_at: '2026-10-10T00:00:00Z',
    expires_at: '2026-11-10T00:00:00Z' }] }, alternative_bodies: [{ hash, text: 'Complete alternative' }] };
  a.sqlite.prepare("UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.text_alternatives', json(?)) WHERE version_id = ?")
    .run(JSON.stringify(record.snapshot.text_alternatives), 'v2');
  expect((await readFramedSyncInventoryEntry(a.db, key))!.unready).toBe(true);
  await upsertRemoteVersion(a.db, record);
  expect((await readFramedSyncInventoryEntry(a.db, key))!.unready).toBe(false);
  expect((await loadRetainedSyncNodeVersionFact(a.db, 'v2'))!.alternative_bodies).toEqual(record.alternative_bodies);
});

it('does not resurrect an explicitly deleted historical body through a replayed sync pack or merge-base restore', async () => {
  const a = await host();
  a.sqlite.exec(`ATTACH DATABASE ':memory:' AS inc;
    CREATE TABLE inc.node_sync_versions AS SELECT * FROM main.node_sync_versions;
    CREATE TABLE inc.node_sync_tombstones AS SELECT * FROM main.node_sync_tombstones;
    CREATE TABLE inc.nodes AS SELECT * FROM main.nodes;
    UPDATE inc.nodes SET current_version_id = 'v1' WHERE id = 'topic'`);
  await upsertRemoteVersion(a.db, deletion);
  await loadVerifiedExistingSyncPackVersions(a.db, 'inc');
  await rehydrateStoredVersionBodies(a.db, 'inc');
  await restoreIncomingNodeMergeBases(a.db, 'inc');
  expect((await loadRetainedSyncNodeVersionFact(a.db, 'v1'))!).toMatchObject({
    body_text: null, content_hash: v1.content_hash, snapshot: { body_deleted: true } });
  expect((await a.current()).body_text).toBe(v2.body_text);
});
