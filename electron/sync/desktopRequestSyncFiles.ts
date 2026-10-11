import { promises as fs } from 'node:fs';
import path from 'node:path';

import { framedSyncFileKey } from '../../lib/core/sync/framedSyncFilePort.js';
import type { RequestSyncFilePort } from '../../lib/core/sync/requestSyncFiles.js';

/** Private request scratch data is never resumed after a crash and needs no durable publication. */
export function createDesktopRequestSyncFiles(databasePath: string): RequestSyncFilePort {
  const root = path.resolve(path.dirname(databasePath), '..', 'SyncTransport');
  const resolve = (key: string) => {
    const validated = framedSyncFileKey(...key.split('/'));
    if (!validated.startsWith('requests/')) throw new Error('request_sync_directory_invalid');
    return path.join(root, validated);
  };
  return {
    async read(key) {
      try { return new Uint8Array(await fs.readFile(resolve(key))); }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async write(key, bytes) {
      const file = resolve(key);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, bytes, { mode: 0o600 });
    },
    async remove(key) { await fs.rm(resolve(key), { recursive: true, force: true }); }
  };
}
