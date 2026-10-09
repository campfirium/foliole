// @vitest-environment node
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { retireFramedSyncFrozenBodies } from '../../lib/core/sync/framedSyncFrozenBody.js';
import { compareFramedSyncInventories, type FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { createFramedSyncOutboundReceiptStaging } from '../../lib/core/sync/framedSyncOutboundReceiptStaging.js';
import { readFramedSyncPublishedBody } from '../../lib/core/sync/framedSyncPublishedBody.js';
import { loadFramedSyncPublishedOutboundValue } from '../../lib/core/sync/framedSyncPublishedOutboundValue.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';
import { upsertTextBodyBlob } from '../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { loadDesktopFramedSyncPublishedBlobSources } from '../sync/desktopFramedSyncBlobSources.js';

import { createDesktopFramedSyncInboundStaging } from './desktopFramedSyncInboundStaging.js';
import { publishDesktopFramedSyncNodeOutbound } from './desktopFramedSyncOutboundSelection.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach((device) => device.sqlite.close()));
const context = (receiverDeviceId: string): FramedSyncContext => ({ groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  receiverDeviceId, receiverLibraryEpoch: `${receiverDeviceId}-epoch`, senderDeviceId: 'sender',
  senderLibraryEpoch: 'sender-epoch' });

async function fixture() {
  const host = textDevice();
  devices.push(host);
  const record = textBranch('original', '\ufeffOriginal\r\n😀\u0000end');
  const alternative = { hash: hashTextBody('Complete alternative'), text: 'Complete alternative' };
  record.alternative_bodies = [alternative];
  record.snapshot.text_alternatives = [{ id: 'choice', body_blob_hash: alternative.hash, source_host_name: 'peer',
    created_at: record.version_created_at!, expires_at: '2100-01-01T00:00:00.000Z' }];
  await host.receive([record]);
  const source: FramedSyncInventoryEntry = { frontierFactIds: [record.version_id!], globalId: 'topic', objectType: 'node',
    requiredRelationIds: [], resourceHashes: [hashTextBody(record.body_text!), alternative.hash].map(hexToBytes),
    reviewFactIds: [], sharedStateHash: hexToBytes(record.content_hash!) };
  const [difference] = compareFramedSyncInventories({ local: [source], remote: [] });
  if (!difference) throw new Error('difference_missing');
  const publish = async (receiver: string) => {
    const result = await publishDesktopFramedSyncNodeOutbound({ context: context(receiver), difference,
      port: host.db, readCurrentInventoryEntry: async () => source });
    if (result.kind !== 'published') throw new Error('publication_missing');
    return result.publication;
  };
  return { host, record, alternative, publish };
}

it('replays the original main and alternative text after business bodies change or retire', async () => {
  const { host, record, alternative, publish } = await fixture();
  const publication = await publish('receiver');
  await host.receive([textBranch('edited', 'Later text', record)]);
  host.sqlite.exec(`DELETE FROM content_blob_data; UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_remove(json_set(snapshot_json, '$.content', NULL), '$.text_alternative_bodies')
    WHERE version_id = 'original'`);
  const value = await loadFramedSyncPublishedOutboundValue(host.db, context('receiver'), bytesToHex(publication.transferId));
  expect(value.blobs.every((blob) => blob.body_source === 'frozen_body' && blob.data_text === undefined)).toBe(true);
  const replay = [];
  for (const blob of value.blobs) replay.push(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    await readFramedSyncPublishedBody(host.db, context('receiver'), { transferId: value.transfer_id,
      hash: blob.sha256, byteLength: Number(blob.byte_length) })));
  expect(replay).toEqual([record.body_text, alternative.text]);
  const sources = await loadDesktopFramedSyncPublishedBlobSources(host.db, publication.manifest);
  const texts: string[] = [];
  for (const source of sources) {
    const chunks = [];
    for await (const data of source.chunks()) chunks.push(Buffer.from(data));
    texts.push(Buffer.concat(chunks).toString('utf8'));
  }
  expect(texts).toEqual([record.body_text, alternative.text]);
});

it('releases temporary bytes only after all receiver holds and inbound pins finish', async () => {
  const { host, publish } = await fixture();
  const first = await publish('first');
  const second = await publish('second');
  const pinned = second.manifest.blobs[0]!;
  await createDesktopFramedSyncInboundStaging(host.db).admitInboundProposal({
    context: second.context, contentId: second.contentId, transferId: second.transferId,
    factCount: BigInt(second.manifest.facts.length), blobCount: BigInt(second.manifest.blobs.length),
    totalBlobBytes: second.manifest.blobs.reduce((sum, blob) => sum + blob.byteLength, 0n) });
  host.sqlite.prepare('INSERT INTO framed_sync_blob_pins VALUES (?, ?, ?, ?, ?)')
    .run(second.transferId, pinned.sha256, Number(pinned.byteLength), pinned.role, 1);
  const staging = createFramedSyncOutboundReceiptStaging(host.db);
  const release = async (publication: typeof first) => {
    await staging.commitOutboundReceipt({ transferId: publication.transferId, contentId: publication.contentId,
      receiverDeviceId: publication.context.receiverDeviceId, receiverLibraryEpoch: publication.context.receiverLibraryEpoch,
      appliedStateHash: publication.contentId });
    await staging.releaseOutboundHolds(publication.transferId);
  };
  await expect(staging.releaseOutboundHolds(first.transferId)).rejects.toThrow('receipt_required_for_hold_release');
  await release(first);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(2);
  await loadFramedSyncPublishedOutboundValue(host.db, context('second'), bytesToHex(second.transferId));
  await release(second);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(1);
  host.sqlite.prepare('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?').run(second.transferId);
  await retireFramedSyncFrozenBodies(host.db, second.transferId);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  expect((await host.current()).body_text).toBe('\ufeffOriginal\r\n😀\u0000end');
});

it('releases each receiver independently while an editor keeps its original basis readable', async () => {
  const { host, record, publish } = await fixture();
  await retainLocalEditBase(host.db, { nodeId: 'topic', versionId: 'original', holdId: 'editor' });
  const first = await publish('first');
  const second = await publish('second');
  const parents = host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
  await host.receive([textBranch('edited', 'Later complete body', record)]);
  const expectedParents = [...parents, { version_id: 'edited', parent_version_id: 'original', ordinal: 0 }];
  const staging = createFramedSyncOutboundReceiptStaging(host.db);
  const release = async (publication: typeof first) => {
    await staging.commitOutboundReceipt({ transferId: publication.transferId, contentId: publication.contentId,
      receiverDeviceId: publication.context.receiverDeviceId, receiverLibraryEpoch: publication.context.receiverLibraryEpoch,
      appliedStateHash: publication.contentId });
    await staging.releaseOutboundHolds(publication.transferId);
    await collectNodeVersionPayloads(host.db, 'topic', Number.MAX_SAFE_INTEGER, true);
  };
  const originalBody = () => host.sqlite.prepare("SELECT body_text FROM node_sync_versions WHERE version_id='original'").pluck().get();
  await release(first);
  expect(originalBody()).toBe(record.body_text);
  expect(host.sqlite.prepare(`SELECT p.receiver_device_id FROM framed_sync_outbound_holds h
    JOIN framed_sync_outbound_publications p ON p.transfer_id = h.transfer_id`).pluck().all()).toEqual(['second']);
  await loadFramedSyncPublishedOutboundValue(host.db, context('second'), bytesToHex(second.transferId));
  await release(second);
  expect(originalBody()).toBe(record.body_text);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0);
  await releaseLocalEditBase(host.db, 'editor', 'topic');
  await collectNodeVersionPayloads(host.db, 'topic', Number.MAX_SAFE_INTEGER, true);
  expect(originalBody()).toBeNull();
  expect((await host.current()).body_text).toBe('Later complete body');
  expect(host.sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(expectedParents);
  expect(host.sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').pluck().all())
    .toEqual(['edited', 'original']);
});

async function legacyPublication() {
  const value = await fixture();
  const publication = await value.publish('receiver');
  await upsertTextBodyBlob(value.host.db, value.record.body_text!, value.record.updated_at,
    hashTextBody(value.record.body_text!));
  await upsertTextBodyBlob(value.host.db, value.alternative.text, value.record.updated_at, value.alternative.hash);
  value.host.sqlite.exec('DELETE FROM framed_sync_available_blobs');
  return { ...value, publication };
}

async function upgrade(host: ReturnType<typeof textDevice>, companion: boolean) {
  host.sqlite.pragma(`user_version = ${companion ? 78 : 149}`);
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 78, 79));
  else initializeDatabaseSchema(host.sqlite);
}

it.each([false, true])('preserves legacy pending publications through the normal upgrade companion=%s', async (companion) => {
  const { host, record, alternative, publication } = await legacyPublication();
  const holds = host.sqlite.prepare('SELECT * FROM framed_sync_outbound_holds').all();
  await upgrade(host, companion);
  host.sqlite.exec('DELETE FROM content_blob_data');
  const value = await loadFramedSyncPublishedOutboundValue(host.db, context('receiver'), bytesToHex(publication.transferId));
  expect(value.blobs.every((blob) => blob.body_source === 'frozen_body' && blob.data_text === undefined)).toBe(true);
  const replay = [];
  for (const blob of value.blobs) replay.push(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    await readFramedSyncPublishedBody(host.db, context('receiver'), { transferId: value.transfer_id,
      hash: blob.sha256, byteLength: Number(blob.byte_length) })));
  expect(replay).toEqual([record.body_text, alternative.text]);
  expect(value.transfer_id).toBe(bytesToHex(publication.transferId));
  expect(host.sqlite.prepare('SELECT * FROM framed_sync_outbound_holds').all()).toEqual(holds);
  if (companion) await host.db.transaction((tx) => migrateCompanionDatabase(tx, 79, 79));
  else initializeDatabaseSchema(host.sqlite);
});

it.each([false, true])('rolls back a legacy upgrade with corrupted frozen input companion=%s', async (companion) => {
  const { host, publication } = await legacyPublication();
  host.sqlite.prepare('UPDATE content_blob_data SET data = ? WHERE hash = ?')
    .run(Buffer.from('Corrupted bytes'), bytesToHex(publication.manifest.blobs[0]!.sha256));
  await expect(upgrade(host, companion)).rejects.toThrow('framed_sync_published_body_unavailable');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(companion ? 78 : 149);
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  expect(host.sqlite.prepare('SELECT state FROM framed_sync_outbound_publications').pluck().get()).toBe('published');
  expect(host.sqlite.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
});
