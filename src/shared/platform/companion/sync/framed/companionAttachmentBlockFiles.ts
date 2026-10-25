import { z } from 'zod';

import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { createAttachmentBlockReceiver, type AttachmentBlockResult, type AttachmentBlockResource } from '../../../../../../lib/core/sync/attachmentBlockReceiver.js';
import { completeAttachmentDemand, recordAttachmentDemandAttempt } from '../../../../../../lib/core/sync/attachmentDemandQueue.js';
import { attachmentSourceVerification } from '../../../../../../lib/core/sync/attachmentSourceVerification.js';
import { attachmentWorkBudget } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../../../../../lib/core/sync/requestSyncAttachmentNeeds.js';
import type { RequestSyncAttachmentHost } from '../../../../../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { NativeCompanionFramedFileRequest } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { notifyAttachmentResourceAvailable } from '../../../runtime/attachmentResourceAvailability.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { decodeCompanionFileBytes } from './companionFileBytes.js';
import { createCompanionFramedSyncFiles } from './companionFramedSyncFiles.js';
import { importCompanionPdfTextArtifact } from './companionPdfTextArtifact.js';

const hosts = new WeakMap<object, { generation: string; host: Promise<RequestSyncAttachmentHost> }>();
const statSchema = z.object({ present: z.boolean(), length: z.number().int().nonnegative(), hash: z.string() });
type Operation = Omit<Extract<NativeCompanionFramedFileRequest, { operation: 'attachment' }>, 'operation' | 'library_key' | 'generation_id'>;

export function currentCompanionAttachmentHost(db: RequestSyncDatabaseHost): Promise<RequestSyncAttachmentHost> {
  const database = getIosCompanionDatabaseOwner();
  const owner = companionFramedFileOwner(database);
  const cached = hosts.get(database);
  if (cached?.generation === owner.generation_id) return cached.host;
  const host = createCompanionAttachmentHost(db, owner);
  hosts.set(database, { generation: owner.generation_id, host });
  void host.catch(() => { if (hosts.get(database)?.host === host) hosts.delete(database); });
  return host;
}

export async function createCompanionAttachmentHost(db: RequestSyncDatabaseHost,
  owner: ReturnType<typeof companionFramedFileOwner>): Promise<RequestSyncAttachmentHost> {
  const files = createCompanionFramedSyncFiles(FolioleCompanionSync, owner);
  const call = (operation: Operation) => FolioleCompanionSync.accessFramedSyncFile({ ...owner, ...operation, operation: 'attachment' });
  const stat = async (key: string, partial = false) => statSchema.parse(await call({ key, partial, action: 'stat' }));
  let acquired: Promise<unknown> | undefined;
  const receiver = createAttachmentBlockReceiver({
    exclusive: (hash, execute) => files.exclusive(`attachment-${hash}`, async () => {
      acquired ??= call({ key: hash, action: 'acquire' }).catch(error => { acquired = undefined; throw error; });
      await acquired;
      return execute();
    }),
    async complete(resource) {
      const info = await stat(resource.storageKey);
      if (!info.present) return false;
      return info.length === resource.byteLength && info.hash === resource.storageKey.slice(0, 64);
    },
    partialLength: async hash => (await stat(hash, true)).length,
    truncate: async (key, length) => { await call({ key, length, action: 'truncate' }); },
    append: async (key, offset, bytes) => { await call({ key, offset, base64: encode(bytes), action: 'append' }); },
    verifyPartial: async key => (await call({ key, partial: true, action: 'hash' })).hash === key,
    discardPartial: async key => { await call({ key, action: 'discard' }); },
    publish: async resource => { attachmentSourceVerification.invalidate(resource.storageKey); await call({ key: resource.storageKey, action: 'publish' }); },
    availability: (hash, available) => db.write(port => recordFramedSyncResourceAvailability(port, [hash], available))
  });
  const inspect = async (keys: string[]) => z.array(z.boolean()).parse(
    (await call({ key: '', keys, action: 'source-stat-batch' })).presence);
  const completed = <T extends AttachmentBlockResult>(key: string, pending: Promise<T>) => completeReceived(db, key, pending);
  const host: RequestSyncAttachmentHost = {
    openReceiveSession: options => receiver.openReceiveSession(options, resource => commitReceived(db, resource)),
    attempted: key => db.write(port => recordAttachmentDemandAttempt(port, key)),
    async importPdfText(pdf, artifact) {
      await importCompanionPdfTextArtifact(db, host, pdf, artifact);
      if ((await stat(pdf)).present) await db.write(port => completeAttachmentDemand(port, pdf));
    },
    async needsSlice(shouldYield, excluded) {
      return readRequestSyncAttachmentNeedsSlice(db, inspect, shouldYield, true, excluded);
    },
    status: resource => completed(resource.storageKey, receiver.status(resource)),
    receiveWindow: receiveCompanionWindow(db, receiver),
    receive: (resource, offset, bytes) => completed(resource.storageKey, receiver.receive(resource, offset, bytes)),
    withFile: (key, consume, options) => files.exclusive(`send-${key}`, async () => {
      const info = statSchema.parse(await call({ key, action: 'source-open' }));
      if (!info.present) throw new Error('attachment_source_missing');
      try {
        const file = { resource: { storageKey: key, byteLength: info.length }, async read(offset: number, length: number) {
          const result = await call({ key, action: 'source-read', offset, length });
          if (typeof result.base64 !== 'string') throw new Error('attachment_source_response_invalid');
          return decodeCompanionFileBytes(result.base64);
        } };
        return await consume(await attachmentSourceVerification.verify(
          JSON.stringify([owner.library_key, owner.generation_id]), file, options?.shouldYield));
      } finally { await call({ key, action: 'source-close' }); }
    }),
    needs: async () => (await readRequestSyncAttachmentNeedsSlice(db, inspect, attachmentWorkBudget(), true)).keys
  };
  return host;
}

function encode(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(''));
}

async function notifyComplete<T extends AttachmentBlockResult>(storageKey: string, pending: Promise<T>) {
  const result = await pending;
  if (result.kind === 'complete') notifyAttachmentResourceAvailable(storageKey);
  return result;
}

async function completeReceived<T extends AttachmentBlockResult>(db: RequestSyncDatabaseHost, key: string, pending: Promise<T>) {
  const result = await notifyComplete(key, pending);
  if (result.kind === 'complete' && !key.endsWith('.pdf')) await db.write(port => completeAttachmentDemand(port, key));
  return result;
}

function receiveCompanionWindow(db: RequestSyncDatabaseHost, receiver: ReturnType<typeof createAttachmentBlockReceiver>)
  : NonNullable<RequestSyncAttachmentHost['receiveWindow']> {
  return async (resource, offset, execute) => {
    const result = await receiver.receiveWindow(resource, offset, execute);
    if (result.offset === resource.byteLength) await completeReceived(db, resource.storageKey,
      Promise.resolve({ kind: 'complete', offset: result.offset }));
    return result;
  };
}

async function commitReceived(db: RequestSyncDatabaseHost, resource: AttachmentBlockResource) {
  await db.write(port => port.transaction(async tx => {
    await recordFramedSyncResourceAvailability(tx, [resource.storageKey.slice(0, 64)], true);
    if (!resource.storageKey.endsWith('.pdf')) await completeAttachmentDemand(tx, resource.storageKey);
  }));
  notifyAttachmentResourceAvailable(resource.storageKey);
}
