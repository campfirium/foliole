// @vitest-environment node
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, createPeer, edit, startLibraries } from '../../../../../../electron/database/syncEmptyLibraryTestSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles.js';
import { framedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { projectFramedSyncDifferenceRequest } from '../../../../../../lib/core/sync/framedSyncDifferenceRequest.js';
import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { readFramedSyncPublishedBodyOperation } from '../../../../../../lib/core/sync/framedSyncPublishedBodyOperation.js';
import { readFramedSyncPublishedFactOperation } from '../../../../../../lib/core/sync/framedSyncPublishedFactOperation.js';
import { projectFramedSyncResourceRequest } from '../../../../../../lib/core/sync/framedSyncResourceRequest.js';

import { completeCompanionFramedSyncOutbound } from './companionFramedSyncDataOperation.js';
import { inspectCompanionFramedSyncOutbound, prepareCompanionFramedSyncOutbound } from './companionFramedSyncOutbound.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

it('keeps native publication, frozen content and completion outside the business database across reopening', async () => {
  const source = createPeer('native-file-source');
  const directory = `${source.file}.sync`;
  const files = createDesktopFramedSyncFiles(directory);
  edit(source, 'Original file-owned body');
  const prepared = await prepareCompanionFramedSyncOutbound(source.port, { ...context,
    object_id: 'topic', object_type: 'node', include_current_node: true,
    frontier_fact_ids: [], required_relation_ids: [], review_fact_ids: [], state_fact_ids: [] }, files);
  const body = prepared.blobs.find(blob => blob.role === 1)!;
  edit(source, 'Later business body');
  const reopened = createDesktopFramedSyncFiles(directory);
  const replay = await prepareCompanionFramedSyncOutbound(source.port,
    { ...context, transfer_id: prepared.transfer_id }, reopened);
  expect(replay.header_message_bytes).toEqual(prepared.header_message_bytes);
  const stored = await readFramedSyncPublishedBodyOperation(source.port, { ...context,
    transfer_id: prepared.transfer_id, sha256: body.sha256, byte_length: body.byte_length }, reopened);
  expect(Buffer.from(stored.data_base64, 'base64').toString()).toBe('Original file-owned body');
  const reads: string[] = [];
  const bounded = { ...reopened, async read(key: string) { reads.push(key); return reopened.read(key); } };
  const fact = await readFramedSyncPublishedFactOperation(source.port, { ...context,
    transfer_id: prepared.transfer_id, fact_index: 0, fragment_index: 0 }, bounded);
  expect(decodeAndValidateProtocolMessage(new Uint8Array(fact.message_bytes), 3).payloadCase).toBe('fact');
  expect(reads.filter(key => key.includes('/facts/'))).toEqual([`outbound/${prepared.transfer_id}/facts/0.json`]);
  const receipt = { content_id: prepared.content_id, transfer_id: prepared.transfer_id,
    applied_state_hash: 'd'.repeat(64), receiver_device_id: 'receiver', receiver_library_epoch: 'r' };
  expect((await completeCompanionFramedSyncOutbound(source.port, receipt, reopened)).receipt_state).toBe('committed');
  expect((await completeCompanionFramedSyncOutbound(source.port, receipt, reopened)).receipt_state).toBe('identical');
  expect(await reopened.read(`bodies/${body.sha256}.body`)).toBeNull();
  expect(await reopened.list(`outbound/${prepared.transfer_id}/facts`)).toEqual([]);
  expect(await inspectCompanionFramedSyncOutbound(source.port,
    { ...context, transfer_id: prepared.transfer_id, receipt_only: true }, reopened))
    .toEqual({ content_id: prepared.content_id, resource_storage_keys: [] });
  for (const table of ['framed_sync_outbound_publications', 'framed_sync_outbound_holds', 'framed_sync_available_blobs',
    'framed_sync_receipts', 'framed_sync_completion_windows']) {
    expect(source.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get(), table).toBe(0);
  }
});

const context = { group_id: 'group', sender_device_id: 'sender', sender_library_epoch: 's',
  receiver_device_id: 'receiver', receiver_library_epoch: 'r' };
const round = new Uint8Array(16).fill(9);

it('freezes a native difference request and rejects a changed source while replaying its original publication', async () => {
  const source = createPeer('native-request-source');
  edit(source, 'Original requested body');
  const entry = await readFramedSyncInventoryEntry(source.port, { globalId: 'topic', objectType: 'node' });
  if (!entry) throw new Error('fixture_inventory_missing');
  const difference = compareFramedSyncInventories({ local: [], remote: [entry] })[0]!;
  const request = { ...context, difference_request_hex:
    bytesToHex(projectFramedSyncDifferenceRequest({ difference, roundId: round }).encoded) };
  expect(await inspectCompanionFramedSyncOutbound(source.port, request)).toEqual({ resource_storage_keys: [] });
  const prepared = await prepareCompanionFramedSyncOutbound(source.port, request);
  const body = prepared.blobs.find((blob) => blob.role === 1)!;
  const [row] = await source.port.query<DbRow>('SELECT data FROM framed_sync_available_blobs WHERE sha256 = ?',
    [hexToBytes(body.sha256)]);
  if (!row) throw new Error('fixture_frozen_body_missing');
  expect(new TextDecoder().decode(framedSyncBytes(row, 'data'))).toBe('Original requested body');
  edit(source, 'A later sender edit');
  await expect(prepareCompanionFramedSyncOutbound(source.port, request))
    .rejects.toThrow('framed_sync_difference_request_source_changed');
  const replay = await prepareCompanionFramedSyncOutbound(source.port, { ...context, transfer_id: prepared.transfer_id });
  const { batch_ready, ...immutable } = prepared;
  expect(batch_ready).toBe(true);
  expect(replay).not.toHaveProperty('batch_ready');
  expect(replay).toEqual({ ...immutable, publication_state: 'identical' });
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(1);
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
});

function resourceRequest() {
  const resource = { demandId: 'demand', globalId: 'article', versionId: 'adopted-version',
    bodyHash: 'a'.repeat(64), storageKey: `${'b'.repeat(64)}.png`, sharedStateHash: new Uint8Array(32).fill(4) };
  return { resource, request: { ...context, difference_request_hex: bytesToHex(encodeValidatedProtocolMessage(
    'difference_request', projectFramedSyncResourceRequest([resource], round))) } };
}

it('publishes only the requested attachment and retains its fixed identity for native replay', async () => {
  const source = createPeer('native-resource-source');
  const { resource, request } = resourceRequest();
  expect(await inspectCompanionFramedSyncOutbound(source.port, request))
    .toEqual({ resource_storage_keys: [resource.storageKey] });
  const prepared = await prepareCompanionFramedSyncOutbound(source.port, { ...request,
    resource_files: [{ storage_key: resource.storageKey, byte_length: '52428800' }] });
  expect(prepared.blobs).toEqual([{ sha256: 'b'.repeat(64), role: 2, required: true,
    storage_key: resource.storageKey, byte_length: '52428800' }]);
  const result = await readFramedSyncPublishedFactOperation(source.port, { ...context,
    transfer_id: prepared.transfer_id, fact_index: 0, fragment_index: 0 });
  const fact = decodeAndValidateProtocolMessage(new Uint8Array(result.message_bytes), 3);
  expect(fact.payloadCase).toBe('fact');
  expect(fact.payload.identity).toMatchObject({ globalId: 'article', kind: 7 });
  expect(await inspectCompanionFramedSyncOutbound(source.port, { ...context, transfer_id: prepared.transfer_id }))
    .toEqual({ resource_storage_keys: [resource.storageKey] });
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_available_blobs').pluck().get()).toBe(0);
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(1);
});

it('rejects missing, duplicate or invalid native file descriptions before acquiring outbound ownership', async () => {
  const source = createPeer('native-resource-invalid');
  const { resource, request } = resourceRequest();
  const valid = { storage_key: resource.storageKey, byte_length: '8' };
  for (const files of [[], [valid, valid], [{ ...valid, byte_length: '-1' }],
    [{ ...valid, storage_key: `${'c'.repeat(64)}.png` }]]) {
    await expect(prepareCompanionFramedSyncOutbound(source.port, { ...request, resource_files: files })).rejects.toThrow();
  }
  await expect(inspectCompanionFramedSyncOutbound(source.port, { ...context, difference_request_hex: 'zz' }))
    .rejects.toThrow('framed_sync_difference_request_bytes_invalid');
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(0);
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0);
});

it('authenticates receipt context after payload retirement and repeats its original completion safely', async () => {
  const source = createPeer('native-receipt');
  const { resource, request } = resourceRequest();
  const prepared = await prepareCompanionFramedSyncOutbound(source.port, { ...request,
    resource_files: [{ storage_key: resource.storageKey, byte_length: '9' }] });
  const inspect = { ...context, transfer_id: prepared.transfer_id, receipt_only: true };
  const expected = { content_id: prepared.content_id, resource_storage_keys: [] };
  expect(await inspectCompanionFramedSyncOutbound(source.port, inspect)).toEqual(expected);
  for (const key of ['group_id', 'sender_device_id', 'sender_library_epoch', 'receiver_device_id', 'receiver_library_epoch']) {
    await expect(inspectCompanionFramedSyncOutbound(source.port, { ...inspect, [key]: 'wrong' }))
      .rejects.toThrow('framed_sync_publication_context_missing');
  }
  const receipt = { content_id: prepared.content_id, transfer_id: prepared.transfer_id,
    applied_state_hash: 'd'.repeat(64), receiver_device_id: 'receiver', receiver_library_epoch: 'r' };
  expect((await completeCompanionFramedSyncOutbound(source.port, receipt)).receipt_state).toBe('committed');
  expect(source.db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(0);
  expect(await inspectCompanionFramedSyncOutbound(source.port, inspect)).toEqual(expected);
  expect((await completeCompanionFramedSyncOutbound(source.port, receipt)).receipt_state).toBe('identical');
});
