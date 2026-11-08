// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { pullAttachmentBatch } from '../../lib/core/sync/requestSyncAttachmentBatchClient.js';
import { attachmentMessage, attachmentRequestSchema } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { withControlRequest, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { readRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer, attachmentHttpSource,
  seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

const storageKey = (text: string) => `${createHash('sha256').update(text).digest('hex')}.pdf`;

async function readDescriptions(exchange: RequestSyncExchange, keys: string[]) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const requests = keys.map(storageKey => attachmentMessage({ operation: 'describe', storageKey, requestId }));
  return withControlRequest(exchange, '/companion/framed-sync?request=attachment_batch_describe', requests, async body => {
    const replies = [];
    for await (const { message } of readRequestSyncWire({ ...exchange, ...body })) {
      expect(message.payloadCase).toBe('request_attachment');
      replies.push(attachmentRequestSchema.parse(message.payload));
    }
    return replies;
  });
}

async function withBatchSource(run: (fixture: {
  root: string; assets: string; exchange(signal?: AbortSignal): RequestSyncExchange;
}) => Promise<void>) {
  const directory = await attachmentHttpDirectory();
  sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const server = await attachmentHttpServer(0);
  try {
    await seedAttachmentTarget([]);
    const exchange = (signal?: AbortSignal) => createDesktopRequestSyncExchange({
      ...(signal ? { signal } : {}),
      endpointUrl: server.url, groupKey: attachmentGroupKey, groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
      context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
        initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' }
    });
    await run({ root: directory.root, assets: resolveRuntimeDataPaths().assetsDir, exchange });
  } finally {
    await server.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness();
    clearCompanionRequestNonceCache();
    vi.unstubAllEnvs();
    await directory.remove();
    sandbox.root = '';
  }
}

it.each([false, true])('persists batched attachments despite a missing member, with pause=%s', async pause => {
  await withBatchSource(async ({ root, assets, exchange: open }) => {
    const exchange = open();
    const first = 'First present file', second = 'Another present file';
    await writeFile(path.join(assets, storageKey(first)), first);
    await writeFile(path.join(assets, storageKey(second)), second);
    await expect(readDescriptions(exchange, [storageKey(first), storageKey(first)]))
      .rejects.toThrow('attachment_batch_request_invalid');
    await expect(readDescriptions(exchange, Array.from({ length: 17 }, (_, index) => storageKey(String(index)))))
      .rejects.toThrow('attachment_batch_request_invalid');
    const descriptions = await readDescriptions(exchange, [first, 'Missing', second].map(storageKey));
    expect(descriptions).toMatchObject([
      { storageKey: storageKey(first), byteLength: Buffer.byteLength(first), state: 'complete' },
      { storageKey: storageKey('Missing'), state: 'end', pending: false },
      { storageKey: storageKey(second), byteLength: Buffer.byteLength(second), state: 'complete' }
    ]);
    const local = await attachmentHttpSource([storageKey(first), storageKey(second)], root);
    try {
      const pulls = descriptions.filter(description => description.state === 'complete').map(description =>
        attachmentRequestSchema.parse({ ...description, operation: 'pull', state: '' }));
      const completed: string[] = [];
      const onMember: Parameters<typeof pullAttachmentBatch>[4] = (request, result) => {
        expect(result).toEqual({ complete: true, offset: request.byteLength, pending: false });
        completed.push(request.storageKey);
      };
      await pullAttachmentBatch(exchange, local.host, pulls, () => pause && completed.length > 0, onMember);
      if (pause) {
        expect(completed).toEqual([storageKey(first)]);
        expect(await local.host.needs()).toEqual([storageKey(second)]);
        expect(await readFile(path.join(local.assetsDir, storageKey(first)), 'utf8')).toBe(first);
        await pullAttachmentBatch(exchange, local.host, pulls.slice(1), () => false, onMember);
      }
      expect(completed).toEqual([storageKey(first), storageKey(second)]);
      expect(await local.host.needs()).toEqual([]);
      expect(await readFile(path.join(local.assetsDir, storageKey(first)), 'utf8')).toBe(first);
      expect(await readFile(path.join(local.assetsDir, storageKey(second)), 'utf8')).toBe(second);
    } finally { await local.close(); }
  });
});

it.each([false, true])('drains the same library through the regular stage with batching=%s', async batch => {
  await withBatchSource(async ({ root, assets, exchange: open }) => {
    const small = [Buffer.from('one'), Buffer.from('two')];
    const large = Buffer.alloc(2 * 1024 * 1024 + 1, 7);
    const contents = [...small, large];
    const keys = contents.map(bytes => `${createHash('sha256').update(bytes).digest('hex')}.gif`);
    await Promise.all(keys.map((key, index) => writeFile(path.join(assets, key), contents[index]!)));
    const local = await attachmentHttpSource(keys, root);
    const requests: string[] = [];
    const exchange = open();
    try {
      const result = await exchangeRequestSyncAttachments(local.host, { ...exchange, ...(batch ? { batchAttachmentPull: true } : {}),
        request(request, body, consume) { requests.push(request); return exchange.request(request, body, consume); }
      }, (_key, error) => { throw error; });
      expect(result).toMatchObject({ pending: 0, transferred: 3 });
      expect(requests.filter(request => request.endsWith('attachment_batch_describe'))).toHaveLength(batch ? 1 : 0);
      expect(requests.filter(request => request.endsWith('attachment_batch_pull'))).toHaveLength(batch ? 1 : 0);
      expect(requests.filter(request => request.endsWith('request=attachments'))).toHaveLength(batch ? 2 : 7);
      await Promise.all(keys.map(async (key, index) =>
        expect(await readFile(path.join(local.assetsDir, key))).toEqual(contents[index])));
    } finally { await local.close(); }
  });
});

it('preserves the published member and resumes the interrupted member from its recovered offset after reopening', async () => {
  await withBatchSource(async ({ root, assets, exchange }) => {
    const first = 'Complete member';
    const second = 'a'.repeat(ATTACHMENT_BLOCK_BYTES * 3 + 1);
    const keys = [first, second].map(storageKey);
    await Promise.all(keys.map((key, index) => writeFile(path.join(assets, key), [first, second][index]!)));
    const firstRun = await attachmentHttpSource(keys, root);
    const abort = new AbortController();
    const request = (storageKey: string, byteLength: number, offset = 0) => attachmentRequestSchema.parse({
      storageKey, byteLength, offset, operation: 'pull', maxBlocks: 4, requestId: new Uint8Array(16)
    });
    try {
      const receiver = { ...firstRun.host, async receive(...args: Parameters<typeof firstRun.host.receive>) {
        const result = await firstRun.host.receive(...args);
        if (args[0].storageKey === keys[1] && result.offset === 2 * ATTACHMENT_BLOCK_BYTES) abort.abort(new Error('link_lost'));
        return result;
      } };
      await expect(pullAttachmentBatch(exchange(abort.signal), receiver,
        [request(keys[0]!, first.length), request(keys[1]!, second.length)], () => false, () => {})).rejects.toThrow(/link_lost|aborted/u);
      expect(await readFile(path.join(firstRun.assetsDir, keys[0]!), 'utf8')).toBe(first);
    } finally { await firstRun.close(); }
    const resumed = await attachmentHttpSource(keys, root, true);
    try {
      expect(await resumed.host.needs()).toEqual([keys[1]]);
      const state = await resumed.host.status({ storageKey: keys[1]!, byteLength: second.length });
      expect(state).toEqual({ kind: 'partial', offset: ATTACHMENT_BLOCK_BYTES });
      await pullAttachmentBatch(exchange(), resumed.host, [request(keys[1]!, second.length, state.offset)], () => false, () => {});
      expect(await resumed.host.needs()).toEqual([]);
      expect(await readFile(path.join(resumed.assetsDir, keys[1]!), 'utf8')).toBe(second);
    } finally { await resumed.close(); }
  });
});
