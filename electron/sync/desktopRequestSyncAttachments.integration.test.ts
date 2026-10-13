// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import * as resourceHash from './resourceFileHash.js';

it.each([0, 5])('transfers both directions through signed HTTP with lost response at request %s', async dropAt => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const localBytes = Buffer.alloc(2 * ATTACHMENT_BLOCK_BYTES + 13, 0x73);
  const remoteBytes = Buffer.alloc(321, 0x74);
  const key = (bytes: Buffer) => `${createHash('sha256').update(bytes).digest('hex')}.pdf`;
  const keys = [key(localBytes), key(remoteBytes)];
  const local = await attachmentHttpSource(keys, directory.root);
  await seedAttachmentTarget(keys);
  const target = resolveRuntimeDataPaths();
  await writeFile(path.join(local.assetsDir, keys[0]!), localBytes);
  await writeFile(path.join(target.assetsDir, keys[1]!), remoteBytes);
  const server = await attachmentHttpServer(dropAt);
  try {
    const failures: unknown[] = [];
    const roundId = crypto.randomUUID();
    const lease = createSyncPeerRoundOwnership(60_000).acquireOutbound('local', roundId);
    if (!lease) throw new Error('test_round_busy');
    const peerRound = { id: roundId, lease, admitted: false };
    const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
      groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
      context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
        initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
    try {
      await withRequestSyncPeerRound(exchange, peerRound, async () => {
        const result = await exchangeRequestSyncAttachments(local.host, exchange, (_key, error) => failures.push(error));
        expect(failures).toEqual([]);
        expect(result).toEqual({ pending: 0, transferred: 2 });
        const hashFile = vi.spyOn(resourceHash, 'hashResourceFile').mockRejectedValue(new Error('Unexpected content read during needs'));
        expect(await local.host.needs()).toEqual([]);
        expect(await exchangeRequestSyncAttachments(local.host, exchange, (_key, error) => failures.push(error)))
          .toEqual({ pending: 0, transferred: 0 });
        expect(hashFile).not.toHaveBeenCalled();
        hashFile.mockRestore();
      });
    } finally { lease.release(); }
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    const reopened = new Database(target.databasePath, { readonly: true });
    try {
      for (const [index, bytes] of [localBytes, remoteBytes].entries()) {
        expect(await readFile(path.join(target.assetsDir, keys[index]!))).toEqual(bytes);
        expect(await readFile(path.join(local.assetsDir, keys[index]!))).toEqual(bytes);
      }
      expect(reopened.prepare('SELECT available FROM framed_sync_resource_availability').pluck().all()).toEqual([1, 1]);
      for (const table of ['framed_sync_resource_demands', 'framed_sync_inbound_transfers', 'framed_sync_receipts']) {
        expect(reopened.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
        expect(local.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
      }
    } finally { reopened.close(); }
  } finally {
    await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.restoreAllMocks(); vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});
