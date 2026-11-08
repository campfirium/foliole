import { Capacitor } from '@capacitor/core';
import { z } from 'zod';

import type { AttachmentBlockFiles, AttachmentBlockResource } from '../../../../../../lib/core/sync/attachmentBlockReceiver.js';
import { attachmentSourceVerification } from '../../../../../../lib/core/sync/attachmentSourceVerification.js';
import type { NativeCompanionFramedFileRequest } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract.js';
import type { NativeCompanionFramedPayloadBudgetOwner } from '../../../../../../lib/platform/nativeCompanionFramedPayloadBudgetContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

import { createCompanionFramedSyncFiles } from './companionFramedSyncFiles.js';

const statSchema = z.object({ present: z.boolean(), length: z.number().int().nonnegative(), hash: z.string() });
type Operation = Omit<Extract<NativeCompanionFramedFileRequest, { operation: 'attachment' }>, 'operation' | 'library_key' | 'generation_id'>;

export function createCompanionAttachmentFiles(owner: NativeCompanionFramedPayloadBudgetOwner,
  availability: AttachmentBlockFiles['availability'], beforePublish?: (key: string) => Promise<void>): AttachmentBlockFiles {
  const files = createCompanionFramedSyncFiles(FolioleCompanionSync, owner);
  const call = (operation: Operation) => FolioleCompanionSync.accessFramedSyncFile({ ...owner, ...operation, operation: 'attachment' });
  const stat = async (key: string, partial = false) => statSchema.parse(await call({ key, partial, action: 'stat' }));
  let acquired: Promise<unknown> | undefined;
  return {
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
    publish: async resource => {
      await beforePublish?.(resource.storageKey);
      attachmentSourceVerification.invalidate(resource.storageKey);
      await call({ key: resource.storageKey, action: 'publish' });
    },
    ...(Capacitor.getPlatform() === 'android' ? {
      async publishReceived(resource: AttachmentBlockResource, check: () => void) {
        await beforePublish?.(resource.storageKey);
        check();
        attachmentSourceVerification.invalidate(resource.storageKey);
        const result = await call({ key: resource.storageKey, length: resource.byteLength, action: 'publish-received' });
        return z.boolean().parse(result.verified);
      }
    } : {}),
    availability
  };
}

function encode(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(''));
}
