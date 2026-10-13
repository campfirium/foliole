// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../lib/core/sync/framedSyncFactApply.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { alternativeForBody } from '../../lib/core/sync/topicTextState.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice } from './topicTextState.testSupport.js';

type Host = ReturnType<typeof textDevice>;
const hosts: Host[] = [];
const roots: string[] = [];
const time = '2026-10-07T00:00:00.000Z';
const proofBody = 'Original proof中文';
const alternativeBody = '\ufeffAlternative😀\0\r\n';
afterEach(async () => {
  hosts.splice(0).forEach(host => host.sqlite.close());
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
function device() { const host = textDevice(); hosts.push(host); return host; }

it.each(['matching', 'standalone', 'mismatch'] as const)(
  'transfers %s deletion and complete alternatives without rewriting source proof', async mode => {
    const source = device(); const target = device();
    await source.receive([textBranch('earlier', 'Earlier', undefined, time)]);
    const record = textBranch('deleted', proofBody, undefined, time);
    record.is_tombstone = true; record.snapshot.deleted_at = time;
    const alternative = alternativeForBody(textBranch('other', alternativeBody, undefined, time), time);
    record.snapshot.text_alternatives = [alternative];
    record.alternative_bodies = [{ hash: alternative.body_blob_hash, text: alternativeBody }];
    record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: proofBody });
    if (mode !== 'standalone') await upsertRemoteVersion(source.db, record);
    await applyRemoteNodeTombstone(source.db, record, false);
    if (mode === 'mismatch') source.sqlite.prepare("UPDATE node_sync_versions SET host_name = 'different' WHERE version_id = 'deleted'").run();
    const originals = source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
    await snapshot(source, async request => {
      const texts = [];
      for await (const fact of request.readFacts()) for (const blob of fact.blobs) {
        texts.push(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await request.loadBody(blob)));
      }
      expect(texts).toContain(mode === 'matching' ? proofBody : '');
      expect(texts).toContain(alternativeBody);
      await receive(target, request);
      await receive(target, request);
    });
    expect(source.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(originals);
    expect(JSON.parse(String(source.sqlite.prepare('SELECT snapshot_json FROM node_sync_tombstones').pluck().get())).content).toBe(proofBody);
    expect(target.sqlite.prepare('SELECT node_id, version_id, content_hash, deleted_at FROM node_sync_tombstones').all())
      .toEqual([{ node_id: 'topic', version_id: 'deleted', content_hash: record.content_hash, deleted_at: time }]);
    const stored = JSON.parse(String(target.sqlite.prepare('SELECT snapshot_json FROM node_sync_tombstones').pluck().get()));
    expect(stored.text_alternative_bodies).toContainEqual({ hash: hashTextBody(alternativeBody), text: alternativeBody });
    expect(target.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").all()).toEqual([]);
    for (const table of ['node_sync_versions', 'node_sync_tombstones']) source.sqlite.exec(
      `UPDATE ${table} SET snapshot_json = json_remove(snapshot_json, '$.text_alternative_bodies')`);
    await expect(snapshot(source, async () => undefined)).rejects.toThrow('text_alternative_body_unavailable');
  });

it('keeps a receiver original body when request history forwards the identity-only version', async () => {
  const source = device(); const target = device();
  const original = textBranch('original', 'Original body😀', undefined, time);
  await source.receive([original]); await target.receive([original]);
  const originalRow = target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'original'").get();
  await source.receive([textBranch('head', 'New body', original, '2026-10-07T00:01:00.000Z')]);
  source.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_blob_hash', NULL)
    WHERE version_id = 'original'`);
  await snapshot(source, async request => {
    const identities = [];
    for await (const fact of request.readFacts()) if (fact.kind === 2 && fact.factId === 'original') identities.push(fact);
    expect(identities).toHaveLength(1);
    expect(identities[0]!.blobs).toEqual([]);
    await receive(target, request);
    await receive(target, request);
  });
  expect(target.sqlite.prepare("SELECT * FROM node_sync_versions WHERE version_id = 'original'").get()).toEqual(originalRow);
  expect(target.sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').all())
    .toEqual([{ version_id: 'head', parent_version_id: 'original' }]);
  expect((await target.current()).body_text).toBe('New body');
});

it('transfers canonical resource references without requiring attachment files', async () => {
  const source = device(); const target = device();
  const references = JSON.stringify([{ storage_key: `${'a'.repeat(64)}.png`, role: 'image', original_name: 'Original.png' }]);
  const record = textBranch('with-resource', 'Original body', undefined, time);
  record.snapshot.resource_references = references;
  await source.receive([record]);
  const original = source.sqlite.prepare('SELECT * FROM node_sync_versions').all();
  await snapshot(source, async request => {
    const roles = [];
    for await (const fact of request.readFacts()) for (const blob of fact.blobs) roles.push(blob.role);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.every(role => role === 1)).toBe(true);
    await receive(target, request);
  });
  expect(source.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(original);
  expect(target.sqlite.prepare("SELECT content, resource_references FROM nodes WHERE id = 'topic'").get())
    .toEqual({ content: 'Original body', resource_references: references });
  const inventory = await readFramedSyncInventoryEntry(target.db, { objectType: 'node', globalId: 'topic' });
  expect(inventory).not.toBeNull();
  expect(inventory?.resourceHashes.map(value => Buffer.from(value).toString('hex')))
    .not.toContain('a'.repeat(64));
});

it('rejects unavailable current text without committing partial receiver facts', async () => {
  const source = device(); const target = device();
  await source.receive([textBranch('current', 'Required current text', undefined, time)]);
  source.sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = 'current'`);
  const original = source.sqlite.prepare('SELECT * FROM node_sync_versions').all();
  target.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    UPDATE node_version_local_proof_state SET library_epoch = 'local-epoch';
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'peer', 'peer-anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
      ('group', 'local', 'local-anchor', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
  const tables = target.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  const state = () => Object.fromEntries(tables.map(({ name }) => [name,
    target.sqlite.prepare(`SELECT * FROM "${name}"`).all()]));
  const before = state();
  await snapshot(source, async request => {
    await expect(applyRequestSyncObject(target.db, {
      context: { groupId: 'group', senderDeviceId: 'peer', senderLibraryEpoch: 'peer-epoch',
        receiverDeviceId: 'local', receiverLibraryEpoch: 'local-epoch', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION },
      peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: 'peer',
        library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
      objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16).fill(1),
      facts: () => request.readFacts(), loadBody: (_db, blob) => request.loadBody(blob)
    })).rejects.toThrow('request_sync_applied_state_missing');
  });
  expect(state()).toEqual(before);
  expect(source.sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(original);
});

async function snapshot<T>(source: Host, consume: (request: RequestSyncFiles) => Promise<T>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foliole-request-original-facts-')); roots.push(root);
  const entry = await readFramedSyncInventoryEntry(source.db, { globalId: 'topic', objectType: 'node' });
  if (!entry) throw new Error('fixture_inventory_missing');
  const [difference] = compareFramedSyncInventories({ local: [entry], remote: [] });
  if (!difference) throw new Error('fixture_difference_missing');
  return withRequestSyncFiles(createDesktopFramedSyncFiles(root), async request => {
    await writeRequestSyncSnapshot(source.db, difference, request);
    return consume(request);
  });
}

function receive(target: Host, request: RequestSyncFiles) {
  return applyFramedFactSources(target.db, [async function* () { yield* request.readFacts(); }], {
    requireCompleteVersionGraph: true, loadBody: (_db, blob) => request.loadBody(blob)
  });
}
