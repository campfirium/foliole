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
import { companionFolderAttachmentRecorder, type CompanionFolderAttachmentRecorder } from '../../folderBackup/companionFolderAttachmentRecorder.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionAttachmentFiles } from './companionAttachmentFiles.js';
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
  const host = createCompanionAttachmentHost(db, owner, companionFolderAttachmentRecorder(db));
  hosts.set(database, { generation: owner.generation_id, host });
  void host.catch(() => { if (hosts.get(database)?.host === host) hosts.delete(database); });
  return host;
}

export async function createCompanionAttachmentHost(db: RequestSyncDatabaseHost,
  owner: ReturnType<typeof companionFramedFileOwner>, recorder?: CompanionFolderAttachmentRecorder): Promise<RequestSyncAttachmentHost> {
  const files = createCompanionFramedSyncFiles(FolioleCompanionSync, owner);
  const call = (operation: Operation) => FolioleCompanionSync.accessFramedSyncFile({ ...owner, ...operation, operation: 'attachment' });
  const stat = async (key: string, partial = false) => statSchema.parse(await call({ key, partial, action: 'stat' }));
  const receiver = createAttachmentBlockReceiver(createCompanionAttachmentFiles(owner,
    (hash, available) => db.write(port => recordFramedSyncResourceAvailability(port, [hash], available)), recorder?.prepare));
  const inspect = async (keys: string[]) => z.array(z.boolean()).parse(
    (await call({ key: '', keys, action: 'source-stat-batch' })).presence);
  const completed = <T extends AttachmentBlockResult>(key: string, pending: Promise<T>) => completeReceived(db, key, pending, recorder);
  const host: RequestSyncAttachmentHost = {
    openReceiveSession: options => receiver.openReceiveSession(options, resource => commitReceived(db, resource, recorder)),
    attempted: key => db.write(port => recordAttachmentDemandAttempt(port, key)),
    async importPdfText(pdf, artifact) {
      await importCompanionPdfTextArtifact(db, host, pdf, artifact);
      if ((await stat(pdf)).present) await db.write(port => completeAttachmentDemand(port, pdf));
    },
    async needsSlice(shouldYield, excluded) {
      return readRequestSyncAttachmentNeedsSlice(db, inspect, shouldYield, true, excluded);
    },
    status: resource => completed(resource.storageKey, receiver.status(resource)),
    receiveWindow: receiveCompanionWindow(db, receiver, recorder),
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

async function completeReceived<T extends AttachmentBlockResult>(db: RequestSyncDatabaseHost, key: string,
  pending: Promise<T>, recorder?: CompanionFolderAttachmentRecorder) {
  const result = await pending;
  if (result.kind === 'complete') await db.write(port => port.transaction(async tx => {
    await recorder?.complete(tx, key);
    if (!key.endsWith('.pdf')) await completeAttachmentDemand(tx, key);
  }));
  if (result.kind === 'complete') notifyAttachmentResourceAvailable(key);
  return result;
}

function receiveCompanionWindow(db: RequestSyncDatabaseHost, receiver: ReturnType<typeof createAttachmentBlockReceiver>, recorder?: CompanionFolderAttachmentRecorder)
  : NonNullable<RequestSyncAttachmentHost['receiveWindow']> {
  return async (resource, offset, execute) => {
    const result = await receiver.receiveWindow(resource, offset, execute);
    if (result.offset === resource.byteLength) await completeReceived(db, resource.storageKey,
      Promise.resolve({ kind: 'complete', offset: result.offset }), recorder);
    return result;
  };
}

async function commitReceived(db: RequestSyncDatabaseHost, resource: AttachmentBlockResource, recorder?: CompanionFolderAttachmentRecorder) {
  await db.write(port => port.transaction(async tx => {
    await recorder?.complete(tx, resource.storageKey);
    await recordFramedSyncResourceAvailability(tx, [resource.storageKey.slice(0, 64)], true);
    if (!resource.storageKey.endsWith('.pdf')) await completeAttachmentDemand(tx, resource.storageKey);
  }));
  notifyAttachmentResourceAvailable(resource.storageKey);
}
