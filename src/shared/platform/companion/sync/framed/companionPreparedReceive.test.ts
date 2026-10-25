// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { requestAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { attachmentRequestSchema } from '../../../../../../lib/core/sync/requestSyncAttachmentContract.js';
import type { RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import type { NativeRequestSyncHttpRequest } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';

const native = vi.hoisted(() => ({ post: vi.fn(), sign: vi.fn(), cancel: vi.fn() }));
vi.mock('../../../companionWorkspaceRuntimeRepository.js', () => ({ FolioleCompanionSync: {
  postRequestSyncHttp: native.post, signCompanionSyncRequest: native.sign, cancelRequestSyncHttp: native.cancel
} }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({
  companionFramedFileOwner: () => ({ library_key: 'library', generation_id: 'generation' })
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => ({}) }));

import { prepareCompanionReceive } from './companionPreparedReceive.js';

const input = { context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'local', initiatorLibraryEpoch: 'local-epoch', responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' },
endpointUrl: 'http://127.0.0.1:1', groupKey: new Uint8Array(32).fill(7) } satisfies Parameters<typeof prepareCompanionReceive>[1];
const query = attachmentRequestSchema.parse({ operation: 'pull', storageKey: `${'a'.repeat(64)}.pdf`,
  requestId: new Uint8Array(16), byteLength: 524288 });
function storage() {
  const values = new Map<string, Uint8Array>();
  const files: RequestSyncFilePort = { read: async key => values.get(key) ?? null,
    write: async (key, bytes) => { values.set(key, bytes.slice()); },
    remove: async key => { for (const name of values.keys()) if (name.startsWith(`${key}/`)) values.delete(name); } };
  return { files, values };
}
beforeEach(() => {
  vi.resetAllMocks();
  native.sign.mockImplementation(async args => ({ headers: { 'X-Nonce': args.nonce, 'X-Timestamp': args.timestamp } }));
  native.post.mockResolvedValue({ response_chunk_count: 0, response_byte_length: 0,
    attachment_receive: { offset: query.byteLength, blocks: 1, pending: false } });
});
afterEach(() => { vi.useRealTimers(); });

it.each(['close', 'abort'])('spools and signs the complete request before dispatch, then cleans an unused %s', async mode => {
  const { files, values } = storage();
  const controller = new AbortController();
  const prepared = await prepareCompanionReceive(files, { ...input, signal: controller.signal }, query);
  expect(native.post).not.toHaveBeenCalled();
  expect(native.sign).toHaveBeenCalledOnce();
  const bytes = Buffer.concat([...values.values()]);
  expect(bytes.length).toBeGreaterThan(0);
  expect(native.sign.mock.calls[0]![0].body_hash).toBe(bytesToHex(sha256(bytes)));
  if (mode === 'abort') controller.abort(new Error('cancelled_before_send'));
  await prepared.close();
  expect(native.post).not.toHaveBeenCalled(); expect(native.cancel).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
});

it('refreshes an aged signature with a fresh nonce without changing the body hash or authentication window', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { files, values } = storage();
  const prepared = await prepareCompanionReceive(files, input, query);
  vi.setSystemTime(Date.now() + 60_001);
  native.post.mockImplementation(async (request: NativeRequestSyncHttpRequest) => {
    expect(request.headers['X-Nonce']).toBe(native.sign.mock.calls[1]![0].nonce);
    expect(request.headers['X-Timestamp']).toBe(new Date().toISOString());
    return { response_chunk_count: 0, response_byte_length: 0,
      attachment_receive: { offset: query.byteLength, blocks: 1, pending: false } };
  });
  try { await expect(prepared.send()).resolves.toMatchObject({ offset: query.byteLength }); }
  finally { await prepared.close(); }
  const [first, refreshed] = native.sign.mock.calls.map(call => call[0]);
  expect(native.sign).toHaveBeenCalledTimes(2);
  expect(refreshed.nonce).not.toBe(first.nonce);
  expect(refreshed.body_hash).toBe(first.body_hash);
  expect(refreshed.path_with_query).toBe(first.path_with_query);
  expect(values.size).toBe(0);
});

it('releases spooled bytes when preparation fails at signing', async () => {
  const { files, values } = storage();
  native.sign.mockRejectedValue(new Error('credential_unavailable'));
  await expect(prepareCompanionReceive(files, input, query)).rejects.toThrow('credential_unavailable');
  expect(values.size).toBe(0); expect(native.post).not.toHaveBeenCalled();
});

it('does not post when data work requests priority while an aged signature is refreshing', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const { files, values } = storage();
  const prepared = await prepareCompanionReceive(files, input, query);
  vi.setSystemTime(Date.now() + 60_001);
  native.sign.mockImplementationOnce(async args => {
    requestAttachmentWorkYield();
    return { headers: { 'X-Nonce': args.nonce, 'X-Timestamp': args.timestamp } };
  });
  try { await expect(prepared.send()).rejects.toThrow('attachment_receive_paused'); }
  finally { await prepared.close(); }
  expect(native.post).not.toHaveBeenCalled();
  expect(values.size).toBe(0);
});
