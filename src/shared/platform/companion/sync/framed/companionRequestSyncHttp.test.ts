// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { beforeEach, expect, it, vi } from 'vitest';

import { readFramedSyncStream } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from '../../../../../../lib/core/sync/requestSyncInventoryWire.js';
import { prepareRequestSyncWire, readRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';
import type { NativeRequestSyncHttpRequest } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';

const native = vi.hoisted(() => ({ post: vi.fn(), sign: vi.fn(), cancel: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  postRequestSyncHttp: native.post, signCompanionSyncRequest: native.sign, cancelRequestSyncHttp: native.cancel
} }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({
  companionFramedFileOwner: () => ({ library_key: 'test-library', generation_id: 'test-generation' })
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => ({}) }));

import { companionRequestSyncHttpChunks, spoolCompanionRequestSyncHttp, withCompanionRequestSyncHttp } from './companionRequestSyncHttp.js';

const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'local', initiatorLibraryEpoch: 'local-epoch', responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' } as const;
const groupKey = new Uint8Array(32).fill(7);
beforeEach(() => { vi.resetAllMocks(); native.sign.mockResolvedValue({ headers: { 'X-Authorization-Id': 'group:local' } }); });

function storage() {
  const values = new Map<string, Uint8Array>();
  const files: FramedSyncFilePort = {
    read: async key => values.get(key) ?? null,
    write: async (key, bytes) => { values.set(key, bytes.slice()); },
    remove: async key => { for (const name of values.keys()) if (name === key || name.startsWith(`${key}/`)) values.delete(name); },
    list: async () => [], exclusive: async (_key, run) => run()
  };
  return { files, values };
}

async function body() {
  return prepareRequestSyncWire({ context, groupKey,
    messages: async function* () { yield { payloadCase: 'round_receipt', payload: {
      roundId: new Uint8Array(16).fill(3), result: 1, deferredFacts: []
    } }; } });
}

it('signs the exact bounded file stream and authenticated endpoint identity, then cleans temporary bytes', async () => {
  const { files, values } = storage();
  native.post.mockImplementation(async (request: NativeRequestSyncHttpRequest) => {
    const parts = Array.from({ length: request.request_chunk_count }, (_, index) => values.get(`${request.directory}/http-out-${index}`)!);
    const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; expect(part.length).toBeLessThanOrEqual(512 * 1024); }
    const signature = native.sign.mock.calls[0]![0];
    expect(signature.body_hash).toBe(bytesToHex(sha256(bytes)));
    const url = new URL(request.url);
    expect(signature.path_with_query).toBe(`${url.pathname}${url.search}`);
    expect(url.searchParams.get('initiator_library_epoch')).toBe('local-epoch');
    expect(url.searchParams.get('responder_device_id')).toBe('peer');
    await files.write(`${request.directory}/http-in-0`, bytes);
    return { response_chunk_count: 1, response_byte_length: bytes.length };
  });
  const received = await withCompanionRequestSyncHttp(files, { context, endpointUrl: 'http://127.0.0.1:1',
    pathWithQuery: '/companion/framed-sync?request=inventory', body: await body() }, async stream => {
    const decoded = [];
    for await (const item of readRequestSyncWire({ context, groupKey, ...stream })) decoded.push(item.message.payloadCase);
    return decoded;
  });
  expect(received).toEqual(['round_receipt']);
  expect([...values.keys()].filter(key => key.startsWith('requests/'))).toEqual([]);
});

it('waits for native cancellation before deleting files owned by the request', async () => {
  const { files, values } = storage();
  const controller = new AbortController();
  let reject!: (error: Error) => void;
  let directory = '';
  native.post.mockImplementation((request: NativeRequestSyncHttpRequest) => {
    directory = request.directory;
    queueMicrotask(() => controller.abort(new Error('cancelled')));
    return new Promise((_resolve, fail) => { reject = fail; });
  });
  native.cancel.mockImplementation(async () => {
    expect([...values.keys()].some(key => key.startsWith(directory))).toBe(true);
    reject(new Error('request_sync_http_cancelled'));
  });
  await expect(withCompanionRequestSyncHttp(files, { context, endpointUrl: 'http://127.0.0.1:1',
    pathWithQuery: '/companion/framed-sync?request=inventory', body: await body(), signal: controller.signal },
  async () => { throw new Error('unexpected_response'); })).rejects.toThrow('request_sync_http_cancelled');
  expect(native.cancel).toHaveBeenCalledOnce();
  expect([...values.keys()].filter(key => key.startsWith('requests/'))).toEqual([]);
});

it.each([0, 1, 3793, 8000])('round-trips an inventory of %i entries through the native HTTP chunk contract', async count => {
  const { files, values } = storage();
  const entries = Array.from({ length: count }, (_, index) => ({
    globalId: `node-${index}`, objectType: 'node', sharedStateHash: new Uint8Array(32).fill(7),
    frontierFactIds: [], requiredRelationIds: [], resourceHashes: [], reviewFactIds: [], stateFactIds: []
  }));
  const wire = await prepareRequestSyncWire({ context, groupKey, messages: async function* () {
    yield* iterateRequestSyncInventory({ entries, roundId: new Uint8Array(16).fill(3) });
  } });
  const directory = 'requests/inventory';
  const result = await spoolCompanionRequestSyncHttp(files, directory, wire);
  const byteLength = [...values.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  const response = await readFramedSyncStream(companionRequestSyncHttpChunks({
    ...files, read: key => files.read(key.replace('/http-in-', '/http-out-'))
  }, directory, { response_chunk_count: result.count, response_byte_length: byteLength }));
  const received = await decodeRequestSyncInventory((async function* () {
    for await (const item of readRequestSyncWire({ context, groupKey, ...response })) yield item.message;
  })());
  expect(received.entries.map(entry => entry.globalId)).toEqual(entries.map(entry => entry.globalId));
  const bytes = Buffer.concat([...values.values()]);
  expect(result.hash).toBe(bytesToHex(sha256(bytes)));
});

it.each(['valid', 'invalid-offset', 'excessive-blocks', 'missing-result'])('returns one bounded native write result without file payload reads (%s)', async fault => {
  const { files, values } = storage();
  const { companionReceiveAttachment } = await import('./companionAttachmentHttp.js');
  const { attachmentRequestSchema } = await import('../../../../../../lib/core/sync/requestSyncAttachmentContract.js');
  const query = attachmentRequestSchema.parse({ operation: 'pull', requestId: new Uint8Array(16).fill(3),
    storageKey: `${'a'.repeat(64)}.pdf`, byteLength: 512 * 1024, maxBlocks: 32 });
  native.post.mockImplementation(async (request: NativeRequestSyncHttpRequest) => {
    expect(request.attachment_receive).toMatchObject({ storage_key: query.storageKey, offset: 0,
      byte_length: query.byteLength, max_blocks: 32, request_id_base64: Buffer.from(query.requestId).toString('base64') });
    return { response_chunk_count: 0, response_byte_length: 0, ...(fault === 'missing-result' ? {} : {
      attachment_receive: { offset: fault === 'invalid-offset' ? 1 : query.byteLength,
        blocks: fault === 'excessive-blocks' ? 33 : 1, pending: false }
    }) };
  });
  const receiving = companionReceiveAttachment({ ...files, read: async () => { throw new Error('file_payload_crossed_bridge'); } },
    { context, groupKey, endpointUrl: 'http://127.0.0.1:1' })(query);
  if (fault === 'valid') await expect(receiving).resolves.toEqual({ offset: query.byteLength, blocks: 1, pending: false });
  else await expect(receiving).rejects.toThrow();
  expect(values.size).toBe(0);
});

it.each(['E_ABORT', 'ENOSPC'])('cancels a blocked attachment request for data work and preserves storage failures (%s)', async code => {
  const { files, values } = storage();
  const { companionReceiveAttachment } = await import('./companionAttachmentHttp.js');
  const { attachmentRequestSchema } = await import('../../../../../../lib/core/sync/requestSyncAttachmentContract.js');
  const { requestAttachmentWorkYield } = await import('../../../../../../lib/core/sync/attachmentWorkBudget.js');
  const error = Object.assign(new Error(code), { code });
  let reject!: (reason: Error) => void;
  native.cancel.mockImplementation(async () => { reject(error); });
  native.post.mockImplementation(() => {
    queueMicrotask(requestAttachmentWorkYield);
    return new Promise((_resolve, fail) => { reject = fail; });
  });
  const receiving = companionReceiveAttachment(files, { context, groupKey, endpointUrl: 'http://127.0.0.1:1' })(
    attachmentRequestSchema.parse({ operation: 'pull', requestId: new Uint8Array(16), storageKey: `${'a'.repeat(64)}.pdf`, byteLength: 524288 }));
  await expect(receiving).rejects.toThrow(code === 'E_ABORT' ? 'attachment_receive_paused' : 'ENOSPC');
  expect(native.cancel).toHaveBeenCalledOnce(); expect(values.size).toBe(0);
});
