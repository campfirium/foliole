// @vitest-environment node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { ATTACHMENT_BATCH_LIMITS } from '../../lib/core/sync/attachmentBatchContract.js';
import { AttachmentBatchResponse, type AttachmentBatchEvent } from '../../lib/core/sync/attachmentBatchResponse.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { attachmentMessage, attachmentRequestSchema } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { withControlRequest, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { readRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

it('sends 128 small files in one signed response and resumes a large file by the batch payload budget', async () => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const originals = [...Array.from({ length: 128 }, (_, index) => Buffer.alloc(128 * 1024, index)),
    Buffer.alloc(0), Buffer.alloc(17 * 1024 * 1024, 0xa7)];
  const keys = originals.map(data => `${createHash('sha256').update(data).digest('hex')}.png`);
  const local = await attachmentHttpSource(keys, directory.root);
  const server = await attachmentHttpServer(-1);
  const owner = createSyncPeerRoundOwnership(60_000);
  const id = crypto.randomUUID(), lease = owner.acquireOutbound('local', id)!;
  const peerRound = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  try {
    await seedAttachmentTarget(keys);
    const paths = resolveRuntimeDataPaths();
    const source = createDesktopAttachmentBlockSource(paths.assetsDir, paths.databasePath);
    for (const [index, key] of keys.entries()) {
      await writeFile(path.join(paths.assetsDir, key), originals[index]!);
      await source.withFile(key, async () => {});
    }
    await withRequestSyncPeerRound(exchange, peerRound, async () => {
      const first = await receiveBatch(exchange, keys.map(storageKey => ({ storageKey, offset: 0 })));
      expect(first.bytes).toBe(ATTACHMENT_BATCH_LIMITS.payloadBytes);
      expect(first.ends).toEqual(keys.slice(0, 129));
      expect(first.blocks).toBe(128);
      expect(first.ranges).toEqual([{ storageKey: keys[129], offset: 0 }]);
      for (const key of keys.slice(0, 128)) expect(first.digests.get(key)?.digest('hex')).toBe(key.slice(0, 64));
      const large = keys[129]!;
      const second = await receiveBatch(exchange, [{ storageKey: large, offset: 0 }]);
      expect(second.bytes).toBe(ATTACHMENT_BATCH_LIMITS.payloadBytes);
      expect(second.ends).toEqual([]);
      expect(second.ranges).toEqual([{ storageKey: large, offset: ATTACHMENT_BATCH_LIMITS.payloadBytes }]);
      const third = await receiveBatch(exchange, [{ storageKey: large, offset: ATTACHMENT_BATCH_LIMITS.payloadBytes }]);
      expect(third.bytes).toBe(1024 * 1024);
      expect(third.ends).toEqual([large]);
      expect(second.digests.get(large)?.digest('hex')).toBe(createHash('sha256').update(originals[129]!.subarray(0, 16 * 1024 * 1024)).digest('hex'));
      expect(third.digests.get(large)?.digest('hex')).toBe(createHash('sha256').update(originals[129]!.subarray(16 * 1024 * 1024)).digest('hex'));
      const short = await receiveBatch(exchange, [keys[0]!, keys[1]!, large].map(storageKey => ({ storageKey, offset: 0 })));
      expect(short.bytes).toBe(16 * 1024 * 1024 - 256 * 1024);
      expect(short.blocks).toBe(33);
      expect(short.ranges).toEqual([{ storageKey: large, offset: 31 * 512 * 1024 }]);
      expect(server.attachmentRequests()).toBe(4);
    });
  } finally {
    lease.release(); owner.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});

async function receiveBatch(exchange: RequestSyncExchange, entries: { storageKey: string; offset: number }[]) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const queries = entries.map(entry => attachmentRequestSchema.parse({ ...entry, requestId, operation: 'batch_pull' }));
  const validator = new AttachmentBatchResponse(queries);
  const ends: string[] = [];
  const ranges: { storageKey: string; offset: number }[] = [];
  const result = { bytes: 0, blocks: 0, ends, ranges, digests: new Map<string, ReturnType<typeof createHash>>() };
  await withControlRequest(exchange, '/companion/framed-sync?request=attachments', queries.map(attachmentMessage), async response => {
    for await (const decoded of readRequestSyncWire({ ...exchange, ...response })) {
      expect(decoded.message.payloadCase).toBe('request_attachment');
      consume(validator.accept(attachmentRequestSchema.parse(decoded.message.payload), decoded.encoded.length));
    }
    validator.finish();
  });
  return result;

  function consume(event: AttachmentBatchEvent) {
    if (event.kind === 'description') result.digests.set(event.resource.storageKey, createHash('sha256'));
    else if (event.kind === 'block') {
      result.digests.get(event.resource.storageKey)!.update(event.data);
      result.blocks++;
    } else if (event.kind === 'file_end') result.ends.push(event.resource.storageKey);
    else if (event.kind === 'range_end') result.ranges.push({ storageKey: event.resource.storageKey, offset: event.offset });
    else if (event.kind === 'batch_end') result.bytes = event.bytes;
    else throw new Error('Unexpected source entry result');
  }
}
