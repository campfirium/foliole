import { createHash } from 'node:crypto';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';

import { readFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { attachmentRequestSchema } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import type { RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { readRequestSyncWire } from '../../lib/core/sync/requestSyncWire.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import type { NativeRequestSyncHttpRequest } from '../../lib/platform/nativeRequestSyncHttpContract.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { postCompanionRequestFixture } from './companionRequestSyncHttp.testSupport.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupSignedHeaders.js';

export const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  initiatorDeviceId: 'peer', initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;

type ExchangeInput = Pick<RequestSyncExchange, 'context' | 'groupKey' | 'signal'> & {
  peerRound: RequestSyncPeerRound; endpointUrl: string;
};

export async function pipelineFixture(createExchange: (host: RequestSyncDatabaseHost, input: ExchangeInput) => RequestSyncExchange, bytes: Buffer[], setup: (root: string) => void, signal?: AbortSignal) {
  const directory = await attachmentHttpDirectory(); setup(directory.root);
  const items = bytes.map(bytes => ({ bytes, key: `${createHash('sha256').update(bytes).digest('hex')}.pdf` }));
  const local = await attachmentHttpSource(items.map(item => item.key), directory.root);
  await seedAttachmentTarget(items.map(item => item.key));
  for (const item of items) await writeFile(path.join(resolveRuntimeDataPaths().assetsDir, item.key), item.bytes);
  const server = await attachmentHttpServer(0);
  const transport = pipelineTransport(local);
  let peerRound = pipelineRound();
  const makeExchange = (signal?: AbortSignal) => createExchange({ ...local.database, files: transport.files }, {
    context, peerRound, ...(signal ? { signal } : {}), groupKey: attachmentGroupKey, endpointUrl: server.productionUrl
  });
  const exchange = makeExchange(signal);
  async function verify() {
    for (const item of items) {
      const actual = await readFile(path.join(local.assetsDir, item.key));
      if (!actual.equals(item.bytes) || createHash('sha256').update(actual).digest('hex') !== item.key.slice(0, 64)) {
        throw new Error('published_bytes_mismatch');
      }
    }
    const persisted = new Database(local.databasePath, { readonly: true });
    try {
      return { needs: await local.host.needs(), available: persisted.prepare(
        'SELECT available FROM framed_sync_resource_availability ORDER BY hash').pluck().all() };
    } finally { persisted.close(); }
  }
  const host = { ...local.host, async needsSlice(shouldYield: () => boolean) {
    const demand = await local.host.needsSlice(shouldYield);
    return { ...demand, keys: items.map(item => item.key).filter(key => demand.keys.includes(key)) };
  } };
  return { directory, local, host, items, exchange, async resumeExchange() {
      await withRequestSyncPeerRound(makeExchange(), peerRound, async () => {});
      peerRound.lease.release(); peerRound = pipelineRound();
      return makeExchange();
    }, ...transport, verify,
    async close() { await withRequestSyncPeerRound(makeExchange(), peerRound, async () => {}); peerRound.lease.release(); await server.close(); await local.close(); } };
}

function pipelineTransport(local: Awaited<ReturnType<typeof attachmentHttpSource>>) {
  const files = local.database.files;

  const signed: Array<{ key: string; offset: number }> = [];
  const posted: Array<{ key: string; offset: number }> = [];
  const spools = new Map<string, Uint8Array>();
  const observedFiles = { ...files, async write(key: string, bytes: Uint8Array) {
    if (key.includes('/http-out-')) spools.set(createHash('sha256').update(bytes).digest('hex'), bytes.slice());
    await files.write(key, bytes);
  } };
  async function sign(input: { body_hash: string; path_with_query: string }) {
    const bytes = spools.get(input.body_hash);
    if (!bytes) throw new Error('signed_body_not_spooled');
    const stream = await readFramedSyncStream((async function* () { yield bytes; })());
    for await (const decoded of readRequestSyncWire({ context, groupKey: attachmentGroupKey, ...stream })) {
      if (decoded.message.payloadCase !== 'request_attachment') continue;
      const query = attachmentRequestSchema.parse(decoded.message.payload);
      if (query.operation === 'pull') signed.push({ key: query.storageKey, offset: query.offset });
    }
    return { headers: createDesktopSyncGroupSignedHeaders({ groupId: 'group', localDeviceId: 'peer',
      method: 'POST', pathWithQuery: input.path_with_query, bodySha256: input.body_hash,
      secret: Buffer.from(attachmentGroupKey).toString('base64url') }) };
  }
  async function post(request: NativeRequestSyncHttpRequest, options: { signal?: AbortSignal; afterAppend?(): void } = {}) {
    if (request.attachment_receive) posted.push({ key: request.attachment_receive.storage_key, offset: request.attachment_receive.offset });
    return postCompanionRequestFixture(files, request, {
      loadCredential: async () => ({ device_id: 'peer', workgroup_key: Buffer.from(attachmentGroupKey).toString('base64url') }),
      async append(key, offset, data) {
        const partial = path.join(local.assetsDir, `.attachment-${key.slice(0, 64)}.partial`);
        if ((await stat(partial)).size !== offset) throw new Error('native_append_offset_changed');
        await appendFile(partial, data);
        options.afterAppend?.();
      }
    }, options.signal);
  }
  return { files: observedFiles, signed, posted, sign, post };
}

function pipelineRound() {
  const id = crypto.randomUUID();
  const lease = createSyncPeerRoundOwnership(60_000).acquireOutbound('local', id);
  if (!lease) throw new Error('fixture_round_busy');
  return { id, lease, admitted: false };
}
