import path from 'node:path';

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { readRequestSyncAttachmentNeeds } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { registerDatabaseConnectionCleanup } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';

type Receiver = Extract<Awaited<ReturnType<typeof openDesktopAttachmentBlockReceiver>>, { kind: 'acquired' }>;
const receivers = new Map<string, Promise<Receiver>>();
registerDatabaseConnectionCleanup(() => {
  const closing = [...receivers.values()];
  receivers.clear();
  for (const pending of closing) void pending.then(receiver => receiver.close()).catch(error => {
    console.error('[sync] attachment receiver close failed', error);
  });
});

export function createDesktopRequestSyncAttachmentHost(host: RequestSyncDatabaseHost): RequestSyncAttachmentHost {
  const { databasePath, assetsDir } = resolveRuntimeDataPaths();
  const source = createDesktopAttachmentBlockSource(assetsDir);
  const checkLibrary = () => {
    const current = resolveRuntimeDataPaths();
    if (current.databasePath !== databasePath || current.assetsDir !== assetsDir) throw new Error('attachment_library_changed');
  };
  const receiver = () => {
    checkLibrary();
    let pending = receivers.get(databasePath);
    if (!pending) {
      pending = openDesktopAttachmentBlockReceiver({ libraryRoot: path.dirname(databasePath), assetsDir,
        availability: (hash, available) => host.write(db => recordFramedSyncResourceAvailability(db, [hash], available))
      }).then(owner => {
        if (owner.kind === 'busy') throw new Error('attachment_receiver_busy');
        return owner;
      });
      receivers.set(databasePath, pending);
      const current = pending;
      void pending.catch(() => { if (receivers.get(databasePath) === current) receivers.delete(databasePath); });
    }
    return pending;
  };
  return {
    withFile(key, consume) { checkLibrary(); return source.withFile(key, consume); },
    async status(resource) { return (await receiver()).status(resource); },
    async receive(resource, offset, bytes) { return (await receiver()).receive(resource, offset, bytes); },
    async needs() {
      checkLibrary();
      return readRequestSyncAttachmentNeeds(host, async key => {
        try { await source.withFile(key, async () => {}); return true; }
        catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
          throw error;
        }
      });
    }
  };
}
