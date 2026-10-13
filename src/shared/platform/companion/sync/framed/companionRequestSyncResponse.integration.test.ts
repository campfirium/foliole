// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { textBranch, textDevice } from '../../../../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles.js';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/androidCompanionHostSchemaStatements.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { encodeFramedSyncStream, readFramedSyncStream } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { readRequestSyncInventorySnapshot } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { transferRequestSyncBatch } from '../../../../../../lib/core/sync/requestSyncBatchExchange.js';
import type { RequestSyncExchange } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import { sendRequestSyncObject, type RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import { readRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { subscribeCompanionSyncApplied } from '../companionSyncApplied.js';

const runtime = vi.hoisted(() => ({ db: undefined as DbPort | undefined, files: undefined as FramedSyncFilePort | undefined }));
const groupKey = new Uint8Array(32).fill(7);
const databaseOwner = {
  databasePath: '/test-library',
  runWriter: <T>(read: (db: DbPort) => Promise<T>) => read(runtime.db!),
  read: <T>(read: (db: DbPort) => Promise<T>) => read(runtime.db!),
  readSnapshot: <T>(read: (db: DbPort) => Promise<T>) => read(runtime.db!)
};
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => databaseOwner }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({ companionFramedFileOwner: () => ({
  library_key: '/test-library', generation_id: 'generation'
}) }));
vi.mock('./companionFramedSyncFiles.js', () => ({ currentCompanionFramedSyncFiles: () => runtime.files! }));
vi.mock('../../../appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppBackground: async () => () => undefined }));


import { rememberCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';
import { respondCompanionRequestSync } from './companionRequestSyncResponse.js';
import { closeCompanionSyncPeerRounds } from './companionSyncPeerRounds.js';

beforeEach(() => {
  vi.stubGlobal('AbortSignal', new Proxy(AbortSignal, {
    get: (target, key, receiver) => key === 'any' ? undefined : Reflect.get(target, key, receiver)
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

it.each([false, true])('applies the native handoff and cleans a late rejected reply=%s', async lateReply => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-request-'));
  const source = textDevice(); const target = textDevice();
  const visibleBodies: Promise<string | null | undefined>[] = [];
  const unsubscribe = subscribeCompanionSyncApplied(() => {
    visibleBodies.push(target.current().then(current => current.body_text));
  });
  try {
    seed(source, 'peer', groupKey); seed(target, 'local', groupKey);
    target.sqlite.exec('DROP TABLE settings');
    runtime.db = target.db;
    runtime.files = createDesktopFramedSyncFiles(path.join(root, 'target'));
    const files = createDesktopFramedSyncFiles(path.join(root, 'source'));
    const body = '🙂'.repeat(180_000);
    await source.receive([textBranch('head', body)]);
    const [difference] = compareFramedSyncDatabaseInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] });
    if (!difference) throw new Error('test_difference_missing');
    const peerState = { contract_version: 3 as const, group_id: 'group', sender_device_identity_key: 'peer',
      library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
    rememberCompanionRequestSyncPeerState(peerState, true);
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;
    await sendRequestSyncObject({ files,
      readSnapshot: read => read(source.db), write: write => write(source.db) }, { context, groupKey, difference }, async stream => {
      const { directory, count, byteLength } = await spoolNativeObjectRequest(runtime.files!, stream);
      const payload = { peer_round_id: crypto.randomUUID(), peer_round_mode: 'single', directory, library_key: '/test-library', generation_id: 'generation', mode: 'object',
        group_id: 'group', initiator_device_id: 'peer', initiator_library_epoch: 'peer-epoch',
        responder_device_id: 'local', responder_library_epoch: 'local-epoch', object_type: 'node', global_id: 'topic',
        request_chunk_count: count, request_byte_length: byteLength };
      await expect(respondCompanionRequestSync({ ...payload, generation_id: 'obsolete' })).rejects.toThrow('request_sync_library_changed');
      expect(await target.db.query('SELECT id FROM nodes')).toEqual([]);
      expect(visibleBodies).toEqual([]);
      if (lateReply) {
        await expect(respondCompanionRequestSync(payload, async () => {
          throw new Error('sync_group_data_request_not_found');
        })).rejects.toThrow('sync_group_data_request_not_found');
        expect((await target.current()).body_text).toBe(body);
        expect(visibleBodies).toHaveLength(1);
        expect(await Promise.all(visibleBodies)).toEqual([body]);
        expect(await runtime.files!.list(directory)).toEqual([]);
        return;
      }
      const result = await respondCompanionRequestSync(payload);
      const response = await readFramedSyncStream((async function* () {
        for (let index = 0; index < result.response_chunk_count; index++) yield (await runtime.files!.read(`${directory}/http-out-${index}`))!;
      })());
      const messages = [];
      for await (const decoded of readRequestSyncWire({ ...response, context, groupKey })) messages.push(decoded.message);
      expect(messages).toMatchObject([{ payloadCase: 'round_receipt', payload: { result: 1 } }]);
      expect((await target.current()).body_text).toBe(body);
      expect(visibleBodies).toHaveLength(1);
      expect(await Promise.all(visibleBodies)).toEqual([body]);
      expect(await target.db.query('SELECT adopted_version_id FROM node_version_member_positions')).toContainEqual({ adopted_version_id: 'head' });
      expect(await target.db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'framed_sync_inbound_transfers'")).toEqual([]);
      closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner());
      await runtime.files!.remove(directory);
    });
  } finally { unsubscribe(); closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner()); source.sqlite.close(); target.sqlite.close(); await rm(root, { force: true, recursive: true }); }
});

async function spoolNativeObjectRequest(files: FramedSyncFilePort, stream: Parameters<typeof encodeFramedSyncStream>[0]) {
  const chunks = [];
  for await (const chunk of encodeFramedSyncStream(stream)) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const directory = `requests/${crypto.randomUUID()}`;
  const size = 512 * 1024;
  for (let offset = 0; offset < bytes.length; offset += size) {
    await files.write(`${directory}/http-in-${offset / size}`, bytes.subarray(offset, offset + size));
  }
  return { directory, count: Math.ceil(bytes.length / size), byteLength: bytes.length };
}

function seed(device: ReturnType<typeof textDevice>, id: string, groupKey: Uint8Array) {
  for (const statement of ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS) device.sqlite.exec(statement);
  device.sqlite.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', ?, 'now', 'now')").run(Buffer.from(groupKey).toString('base64url'));
  device.sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(id);
  device.sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run(`${id}-epoch`);
  device.sqlite.exec(`INSERT INTO companion_meta(key, value, updated_at) VALUES ('host_name', 'Mobile', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at) VALUES
    ('group', 'peer', 'peer', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
    ('group', 'local', 'local', '/local', 'Local', 'ios', 'active', 'now', 'now')`);
}

it.each(['push', 'pull', 'cancel-pull', 'lost-push'])('isolates objects through the native batch handoff: %s', async mode => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-batch-'));
  const initiator = textDevice(); const responder = textDevice();
  const pushing = mode.endsWith('push');
  const source = pushing ? initiator : responder;
  const target = pushing ? responder : initiator;
  const cancellation = new AbortController();
  try {
    seed(initiator, 'peer', groupKey); seed(responder, 'local', groupKey);
    responder.sqlite.exec('DROP TABLE settings');
    runtime.db = responder.db;
    runtime.files = createDesktopFramedSyncFiles(path.join(root, 'responder'));
    const files = createDesktopFramedSyncFiles(path.join(root, 'initiator'));
    const objects = [{ id: 'parent', parent: null }, { id: 'a-good', parent: null },
      { id: 'b-child', parent: 'parent' }, { id: 'c-good', parent: null }];
    for (const { id, parent } of objects) {
      if (mode === 'lost-push' && !id.endsWith('-good')) continue;
      const record = textBranch(`${id}-head`, `Body ${id}`);
      await source.receive([{ ...record, object_id: id, snapshot: { ...record.snapshot, id, parent_id: parent } }]);
    }
    const differences = compareFramedSyncDatabaseInventories({
      local: await readRequestSyncInventorySnapshot(initiator.db), remote: await readRequestSyncInventorySnapshot(responder.db)
    }).filter(difference => difference.globalId !== 'parent');
    const peerState = { contract_version: 3 as const, group_id: 'group', sender_device_identity_key: 'peer',
      library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
    rememberCompanionRequestSyncPeerState(peerState, true);
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;
    const modes: string[] = [];
    const exchange: RequestSyncExchange = { context, groupKey, signal: cancellation.signal,
      request: nativeBatchExchange(modes, mode === 'lost-push') };
    const host: RequestSyncDatabaseHost = { files, enqueueSearchInvalidations: false,
      readSnapshot: read => read(initiator.db), write: write => write(initiator.db),
      objectApplied: () => { if (mode === 'cancel-pull') cancellation.abort(new Error('test_background_cancel')); }
    };
    const options = { peerState: { ...peerState, sender_device_identity_key: 'local', library_epoch: 'local-epoch' } };
    const transfer = transferRequestSyncBatch(host, exchange, differences, options);
    if (mode === 'lost-push') {
      await assertLostBatchResponse(transfer, () => transferRequestSyncBatch(host,
        { ...exchange, request: nativeBatchExchange(modes) }, differences, options), source.db, target.db);
    } else if (mode === 'cancel-pull') {
      await expect(transfer).rejects.toThrow('test_background_cancel');
      expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'a-good' }]);
    } else {
      const results = await transfer;
      expect(results.map(result => [result.globalId, result.error === ''])).toEqual([
        ['a-good', true], ['b-child', false], ['c-good', true]
      ]);
      expect(results[1]!.error).toContain('parent');
      expect(await target.db.query('SELECT id FROM nodes ORDER BY id')).toEqual([{ id: 'a-good' }, { id: 'c-good' }]);
      expect(await target.db.query('SELECT object_id FROM node_version_member_positions ORDER BY object_id'))
        .toEqual([{ object_id: 'a-good' }, { object_id: 'c-good' }]);
    }
    expect(modes).toEqual(mode === 'lost-push' ? ['objects', 'objects'] : [pushing ? 'objects' : 'pulls']);
  } finally { closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner()); initiator.sqlite.close(); responder.sqlite.close(); await rm(root, { force: true, recursive: true }); }
});

async function assertLostBatchResponse(transfer: Promise<unknown>, retry: () => Promise<unknown>, source: DbPort, target: DbPort) {
  await expect(transfer).rejects.toThrow('test_response_lost');
  const expected = [{ id: 'a-good' }, { id: 'c-good' }];
  expect(await target.query('SELECT id FROM nodes ORDER BY id')).toEqual(expected);
  const remaining = compareFramedSyncDatabaseInventories({ local: await readRequestSyncInventorySnapshot(source),
    remote: await readRequestSyncInventorySnapshot(target) });
  expect(remaining.filter(difference => difference.direction === 'local_to_remote')).toEqual([]);
  await retry();
  expect(await target.query('SELECT id FROM nodes ORDER BY id')).toEqual(expected);
  expect(await target.query('SELECT version_id FROM node_sync_versions ORDER BY version_id'))
    .toEqual([{ version_id: 'a-good-head' }, { version_id: 'c-good-head' }]);
  expect(await target.query('SELECT object_id FROM node_version_member_positions ORDER BY object_id'))
    .toEqual([{ object_id: 'a-good' }, { object_id: 'c-good' }]);
  expect(await target.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'framed_sync_inbound_transfers'")).toEqual([]);
}

function nativeBatchExchange(modes: string[], loseResponse = false): RequestSyncExchange['request'] {
  return async (requestPath, body, consume) => {
    const directory = `requests/${crypto.randomUUID()}`;
    const mode = new URL(requestPath, 'http://test').searchParams.get('request')!;
    modes.push(mode);
    const chunks = [];
    for await (const chunk of encodeFramedSyncStream(body)) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    await runtime.files!.write(`${directory}/http-in-0`, bytes);
    const response = await respondCompanionRequestSync({ peer_round_id: crypto.randomUUID(), peer_round_mode: 'single', directory, mode,
      library_key: '/test-library', generation_id: 'generation', group_id: 'group',
      initiator_device_id: 'peer', initiator_library_epoch: 'peer-epoch', responder_device_id: 'local',
      responder_library_epoch: 'local-epoch', request_chunk_count: 1, request_byte_length: bytes.length });
    const stream = await readFramedSyncStream((async function* () {
      for (let index = 0; index < response.response_chunk_count; index++) yield (await runtime.files!.read(`${directory}/http-out-${index}`))!;
    })());
    try {
      if (loseResponse) throw new Error('test_response_lost');
      return await consume(stream);
    }
    finally { closeCompanionSyncPeerRounds(getIosCompanionDatabaseOwner()); await stream.frames[Symbol.asyncIterator]().return?.(); await runtime.files!.remove(directory); }
  };
}
