import path from 'node:path';

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { AttachmentBlockResult } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { completeAttachmentDemand, recordAttachmentDemandAttempt } from '../../lib/core/sync/attachmentDemandQueue.js';
import { attachmentSourceVerification } from '../../lib/core/sync/attachmentSourceVerification.js';
import { readRequestSyncAttachmentNeedsSlice, readRequestSyncAttachmentNeeds } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { registerDatabaseConnectionCleanup, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';
import { createDesktopPdfTextArtifact } from './desktopPdfTextArtifact.js';

type Receiver = Extract<Awaited<ReturnType<typeof openDesktopAttachmentBlockReceiver>>, { kind: 'acquired' }>;
const receivers = new Map<string, Promise<Receiver>>();
registerDatabaseConnectionCleanup(() => {
  const closing = [...receivers.values()];
  receivers.clear();
  attachmentSourceVerification.invalidate();
  for (const pending of closing) void pending.then(receiver => receiver.close()).catch(error => {
    console.error('[sync] attachment receiver close failed', error);
  });
});

export async function createDesktopRequestSyncAttachmentHost(host: RequestSyncDatabaseHost): Promise<RequestSyncAttachmentHost> {
  const { databasePath, assetsDir } = await runWithDatabaseConnectionOwner(resolveRuntimeDataPaths);
  const source = createDesktopAttachmentBlockSource(assetsDir, databasePath);
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
  const completed = async <T extends AttachmentBlockResult>(key: string, pending: Promise<T>) => {
    const result = await pending;
    if (result.kind === 'complete') await host.write(db => completeAttachmentDemand(db, key));
    return result;
  };
  return {
    attempted: key => host.write(db => recordAttachmentDemandAttempt(db, key)),
    derivePdfText: (key, version) => createDesktopPdfTextArtifact(host, assetsDir, key, version),
    async withFile(key, consume, options) { await checkLibrary(); return source.withFile(key, consume, options); },
    async status(resource) { return completed(resource.storageKey, (await receiver()).status(resource)); },
    async receive(resource, offset, bytes) { return completed(resource.storageKey, (await receiver()).receive(resource, offset, bytes)); },
    async needsSlice(shouldYield, limit) {
      await checkLibrary();
      return readRequestSyncAttachmentNeedsSlice(host, inspect, shouldYield, false, limit);
    },
    async needs() {
      await checkLibrary();
      return readRequestSyncAttachmentNeeds(host, keys => Promise.all(keys.map(key => isDesktopAttachmentPresent(assetsDir, key))));
    }
  };
}
