import { z } from 'zod';

import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { createAttachmentBlockReceiver } from '../../../../../../lib/core/sync/attachmentBlockReceiver.js';
import { readRequestSyncAttachmentNeeds } from '../../../../../../lib/core/sync/requestSyncAttachmentNeeds.js';
import type { RequestSyncAttachmentHost } from '../../../../../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { NativeCompanionFramedFileRequest } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { createCompanionFramedSyncFiles } from './companionFramedSyncFiles.js';

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
      if (info.length !== resource.byteLength || info.hash !== resource.storageKey.slice(0, 64)) throw new Error('attachment_published_file_invalid');
      return true;
    },
    partialLength: async hash => (await stat(hash, true)).length,
    truncate: async (key, length) => { await call({ key, length, action: 'truncate' }); },
    append: async (key, offset, bytes) => { await call({ key, offset, base64: encode(bytes), action: 'append' }); },
    verifyPartial: async key => (await call({ key, partial: true, action: 'hash' })).hash === key,
    discardPartial: async key => { await call({ key, action: 'discard' }); },
    publish: async resource => { await call({ key: resource.storageKey, action: 'publish' }); },
    availability: (hash, available) => db.write(port => recordFramedSyncResourceAvailability(port, [hash], available))
  });
  const host: RequestSyncAttachmentHost = { ...receiver,
    withFile: (key, consume) => files.exclusive(`send-${key}`, async () => {
      const info = statSchema.parse(await call({ key, action: 'source-open' }));
      if (!info.present) throw new Error('attachment_source_missing');
      try {
        if (info.hash !== key.slice(0, 64)) throw new Error('attachment_source_invalid');
        return await consume({ resource: { storageKey: key, byteLength: info.length }, async read(offset, length) {
          const result = await call({ key, action: 'source-read', offset, length });
          if (typeof result.base64 !== 'string') throw new Error('attachment_source_response_invalid');
          return Uint8Array.from(atob(result.base64), char => char.charCodeAt(0));
        } });
      } finally { await call({ key, action: 'source-close' }); }
    }),
    needs: () => readRequestSyncAttachmentNeeds(db, async key => {
      try { await host.withFile(key, async () => {}); return true; }
      catch (error) {
        if (error instanceof Error && error.message === 'attachment_source_missing') return false;
        throw error;
      }
    })
  };
  return host;
}

function encode(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(''));
}
