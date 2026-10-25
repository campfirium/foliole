// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import type { AttachmentBatchSealedFile } from '../../lib/core/sync/attachmentBatchReceiveContract.js';
import { createAttachmentBatchStreamReceiver } from '../../lib/core/sync/attachmentBatchStreamReceiver.js';
import { completeAttachmentDemand } from '../../lib/core/sync/attachmentDemandQueue.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { attachmentRequestSchema } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { createDesktopAttachmentBlockSource } from './desktopAttachmentBlockSource.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

it('receives one signed multi-file response and retains its final completion until the real SQLite commit', async () => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const originals = Array.from({ length: 128 }, (_, index) => Buffer.alloc(128 * 1024, index));
  const keys = originals.map(data => `${createHash('sha256').update(data).digest('hex')}.png`);
  const local = await attachmentHttpSource(keys, directory.root);
  const server = await attachmentHttpServer(-1);
  const owner = createSyncPeerRoundOwnership(60_000);
  const id = crypto.randomUUID(), lease = owner.acquireOutbound('local', id)!;
  const peerRound = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  let releaseSql = () => {};
  const sqlGate = new Promise<void>(resolve => { releaseSql = resolve; });
  let reachedSql = () => {};
  const sqlWaiting = new Promise<void>(resolve => { reachedSql = resolve; });
  let finalizers = Promise.resolve();
  try {
    await seedSources(keys, originals);
    await local.host.needsSlice(() => false, 256);
    await withRequestSyncPeerRound(exchange, peerRound, async () => {
      const receive = createAttachmentBatchStreamReceiver(exchange, local.receiver.files);
      const requestId = crypto.getRandomValues(new Uint8Array(16));
      const entries = keys.map(storageKey => ({ storageKey, byteLength: 0, offset: 0, partialLength: 0 }));
      const sealed = (file: AttachmentBatchSealedFile) => {
        finalizers = finalizers.then(async () => {
          await file.ready; expect(await file.verify()).toBe(true); await file.publish();
          if (file.resource.storageKey === keys[127]) { reachedSql(); await sqlGate; }
          await local.database.write(db => db.transaction(async tx => {
            await recordFramedSyncResourceAvailability(tx, [file.resource.storageKey.slice(0, 64)], true);
            await completeAttachmentDemand(tx, file.resource.storageKey);
          }));
          await file.settle('published');
        });
      };
      const operation = await receive({ entries, queries: entries.map(entry => attachmentRequestSchema.parse({ ...entry, requestId, operation: 'batch_pull' })), sealed });
      const result = await operation.data;
      expect(result.bytes).toBe(16 * 1024 * 1024); expect(result.blocks).toBe(128);
      expect(result.entries.every(entry => entry.state === 'file_end')).toBe(true);
      await sqlWaiting;
      let exited = false;
      const exit = operation.exit().then(() => { exited = true; });
      await Promise.resolve(); expect(exited).toBe(false);
      expect(local.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_resource_availability WHERE available=1').pluck().get()).toBe(127);
      expect(local.sqlite.prepare('SELECT COUNT(*) FROM attachment_pending').pluck().get()).toBe(1);
      releaseSql(); await finalizers; await exit;
      expect(local.sqlite.prepare('SELECT COUNT(*) FROM attachment_pending').pluck().get()).toBe(0);
      expect(local.sqlite.prepare('SELECT COUNT(*) FROM framed_sync_resource_availability WHERE available=1').pluck().get()).toBe(128);
      for (const [index, key] of keys.entries()) expect(await readFile(path.join(local.assetsDir, key))).toEqual(originals[index]);
      expect(server.attachmentRequests()).toBe(1);
    });
  } finally {
    releaseSql(); await finalizers.catch(() => undefined); lease.release(); owner.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});

async function seedSources(keys: string[], originals: Buffer[]) {
  await seedAttachmentTarget(keys);
  const paths = resolveRuntimeDataPaths();
  const source = createDesktopAttachmentBlockSource(paths.assetsDir, paths.databasePath);
  for (const [index, key] of keys.entries()) {
    await writeFile(path.join(paths.assetsDir, key), originals[index]!);
    await source.withFile(key, async () => {});
  }
}
