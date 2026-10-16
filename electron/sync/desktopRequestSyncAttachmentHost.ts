import path from 'node:path';

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { createAttachmentDemandCache } from '../../lib/core/sync/attachmentDemandCache.js';
import { inspectAttachmentNeeds, readRequestSyncAttachmentNeeds } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';
import { createDesktopPdfTextArtifact } from './desktopPdfTextArtifact.js';

type Receiver = Extract<Awaited<ReturnType<typeof openDesktopAttachmentBlockReceiver>>, { kind: 'acquired' }>;
const demands = new Map<string, ReturnType<typeof createAttachmentDemandCache>>();
const receivers = new Map<string, Promise<Receiver>>();
registerDatabaseConnectionCleanup(() => {
  const closing = [...receivers.values()];
  receivers.clear();
  demands.clear();
  for (const pending of closing) void pending.then(receiver => receiver.close()).catch(error => {
    console.error('[sync] attachment receiver close failed', error);
  });
});

export async function createDesktopRequestSyncAttachmentHost(host: RequestSyncDatabaseHost): Promise<RequestSyncAttachmentHost> {
  const { databasePath, assetsDir } = await runWithDatabaseConnectionOwner(resolveRuntimeDataPaths);
  const source = createDesktopAttachmentBlockSource(assetsDir);
  let demand = demands.get(databasePath);
  if (!demand) { demand = createAttachmentDemandCache(); demands.set(databasePath, demand); }
  const readDemand = demand;
  const inspect = (keys: string[]) => Promise.all(keys.map(key => isDesktopAttachmentPresent(assetsDir, key)));
  const checkLibrary = async () => {
    const current = await runWithDatabaseConnectionOwner(resolveRuntimeDataPaths);
    if (current.databasePath !== databasePath || current.assetsDir !== assetsDir) throw new Error('attachment_library_changed');
  };
  const receiver = async () => {
    await checkLibrary();
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
    derivePdfText: (key, version) => createDesktopPdfTextArtifact(host, assetsDir, key, version),
    async withFile(key, consume) { await checkLibrary(); return source.withFile(key, consume); },
    async status(resource) { return (await receiver()).status(resource); },
    async receive(resource, offset, bytes) { return (await receiver()).receive(resource, offset, bytes); },
    async needsSlice(shouldYield) {
      await checkLibrary();
      const result = await readDemand(host, shouldYield);
      return { keys: await inspectAttachmentNeeds(host, result.keys, inspect), pending: result.pending };
    },
    async needs() {
      await checkLibrary();
      return readRequestSyncAttachmentNeeds(host, keys => Promise.all(keys.map(key => isDesktopAttachmentPresent(assetsDir, key))));
    }
  };
}
