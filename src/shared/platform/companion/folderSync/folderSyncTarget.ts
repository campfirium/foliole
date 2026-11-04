import { createAttachmentBlockReceiver } from '../../../../../lib/core/sync/attachmentBlockReceiver.js';
import type { FolderSyncWriteTarget } from '../../../../../lib/core/sync/folderSync/writeRound.js';
import { framedSyncFileKey } from '../../../../../lib/core/sync/framedSyncFilePort.js';
import type { FolderSyncNativePlugin, FolderSyncFileOperation } from '../../../../../lib/platform/nativeFolderSyncContract.js';
import { decodeCompanionFileBytes } from '../sync/framed/companionFileBytes.js';

export function encodeFolderFileBytes(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return btoa(parts.join(''));
}

/** Every operation belongs to the native lease of one authorized destination. */
export function createFolderSyncTarget(plugin: FolderSyncNativePlugin, token: string, lease: string): FolderSyncWriteTarget {
  const call = (input: FolderSyncFileOperation) => plugin.access({ ...input, token, lease });
  const key = (value: string) => framedSyncFileKey(...value.split('/'));
  const partial = (hash: string) => `attachments/partial-${hash}`;
  const stat = async (value: string) => {
    const info = await call({ operation: 'stat', key: value });
    if (typeof info.present !== 'boolean' || !Number.isSafeInteger(info.length) || info.length! < 0 || typeof info.hash !== 'string') {
      throw new Error('folder_sync_file_response_invalid');
    }
    return { present: info.present, length: info.length!, hash: info.hash };
  };
  const attachments = createAttachmentBlockReceiver({
    exclusive: async (_hash, execute) => execute(), // The whole round already holds the native target lease.
    availability: async () => undefined, // Destination availability must never mutate the source library.
    complete: async resource => {
      const info = await stat(`attachments/${resource.storageKey}`);
      return info.present && info.length === resource.byteLength && info.hash === resource.storageKey.slice(0, 64);
    },
    partialLength: async hash => {
      const info = await call({ key: partial(hash), operation: 'length' });
      if (!Number.isSafeInteger(info.length) || info.length! < 0) throw new Error('folder_sync_file_response_invalid');
      return info.length!;
    },
    truncate: async (hash, length) => { await call({ key: partial(hash), operation: 'truncate', length }); },
    append: async (hash, offset, bytes) => { await call({ key: partial(hash), operation: 'append', offset, base64: encodeFolderFileBytes(bytes) }); },
    verifyPartial: async hash => (await stat(partial(hash))).hash === hash,
    discardPartial: async hash => { await call({ key: partial(hash), operation: 'remove' }); },
    publish: async resource => { await call({ key: `attachments/${resource.storageKey}`, operation: 'publish' }); }
  });
  return { attachments, files: {
    async read(value) {
      const result = await call({ key: key(value), operation: 'read' });
      if (result.base64 === null) return null;
      if (typeof result.base64 !== 'string') throw new Error('folder_sync_file_response_invalid');
      return decodeCompanionFileBytes(result.base64);
    },
    async write(value, bytes) { await call({ key: key(value), operation: 'write', base64: encodeFolderFileBytes(bytes) }); },
    async remove() { throw new Error('folder_sync_removal_unsupported'); },
    async list() { throw new Error('folder_sync_listing_unsupported'); },
    exclusive: async (_key, execute) => execute()
  } };
}
