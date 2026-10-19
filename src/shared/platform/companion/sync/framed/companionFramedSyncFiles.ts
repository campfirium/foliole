import { framedSyncFileKey, type FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import type { NativeCompanionFramedFilesPlugin } from '../../../../../../lib/platform/nativeCompanionFramedFilesContract.js';
import type { NativeCompanionFramedPayloadBudgetOwner } from '../../../../../../lib/platform/nativeCompanionFramedPayloadBudgetContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { decodeCompanionFileBytes } from './companionFileBytes.js';

export function currentCompanionFramedSyncFiles() {
  return createCompanionFramedSyncFiles(FolioleCompanionSync, companionFramedFileOwner(getIosCompanionDatabaseOwner()));
}

const writers = new Map<string, Promise<void>>();

function base64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(''));
}

export function createCompanionFramedSyncFiles(plugin: NativeCompanionFramedFilesPlugin,
  owner: NativeCompanionFramedPayloadBudgetOwner): FramedSyncFilePort {
  const checked = (key: string) => framedSyncFileKey(...key.split('/'));
  return {
    async read(key) {
      const result = await plugin.accessFramedSyncFile({ ...owner, key: checked(key), operation: 'read' });
      if (result.base64 === null) return null;
      if (typeof result.base64 !== 'string') throw new Error('framed_sync_file_response_invalid');
      return decodeCompanionFileBytes(result.base64);
    },
    async write(key, bytes) {
      await plugin.accessFramedSyncFile({ ...owner, key: checked(key), operation: 'write', base64: base64(bytes) });
    },
    async remove(key) {
      await plugin.accessFramedSyncFile({ ...owner, key: checked(key), operation: 'remove' });
    },
    async list(key) {
      const result = await plugin.accessFramedSyncFile({ ...owner, key: checked(key), operation: 'list' });
      if (!Array.isArray(result.entries)) throw new Error('framed_sync_file_response_invalid');
      return result.entries.map(name => framedSyncFileKey(name)).sort();
    },
    async exclusive(key, execute) {
      const identity = JSON.stringify([owner.library_key, checked(key)]);
      const previous = writers.get(identity) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>(resolve => { release = resolve; });
      writers.set(identity, current);
      await previous;
      try { return await execute(); }
      finally {
        release();
        if (writers.get(identity) === current) writers.delete(identity);
      }
    }
  };
}
