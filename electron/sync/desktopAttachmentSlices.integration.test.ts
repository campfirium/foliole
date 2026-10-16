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

import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { exchangeRequestSyncInventory, pushRequestSyncObject, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

it('releases each bidirectional slice and resumes verified prefixes across new rounds and receiver reopening', async () => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const data = [Buffer.alloc(2 * ATTACHMENT_BLOCK_BYTES + 13, 0x73), Buffer.alloc(2 * ATTACHMENT_BLOCK_BYTES + 7, 0x74)];
  const keys = data.map(bytes => `${createHash('sha256').update(bytes).digest('hex')}.pdf`);
  let local = await attachmentHttpSource(keys, directory.root);
  await seedAttachmentTarget(keys);
  const target = resolveRuntimeDataPaths();
  await writeFile(path.join(local.assetsDir, keys[0]!), data[0]!);
  await writeFile(path.join(target.assetsDir, keys[1]!), data[1]!);
  const server = await attachmentHttpServer(0);
  const owner = createSyncPeerRoundOwnership(60_000);
  try {
    for (let index = 0; index < 4; index++) {
      await runSlice(local, owner, server.url, target.databasePath, index);
      if (index === 0) {
        for (const [dir, key] of [[local.assetsDir, keys[1]!], [target.assetsDir, keys[0]!]]) {
          const prefix = await readFile(path.join(dir!, `.attachment-${key!.slice(0, 64)}.partial`));
          expect(prefix.length).toBe(ATTACHMENT_BLOCK_BYTES);
        }
        await local.close();
        local = await attachmentHttpSource(keys, directory.root, true);
        // Existing crash recovery distrusts the last block after reopening.
        expect(await local.host.status({ storageKey: keys[1]!, byteLength: data[1]!.length }))
          .toEqual({ kind: 'partial', offset: 0 });
      }
    }
    for (let index = 0; index < keys.length; index++) {
      expect(await readFile(path.join(local.assetsDir, keys[index]!))).toEqual(data[index]);
      expect(await readFile(path.join(target.assetsDir, keys[index]!))).toEqual(data[index]);
    }
  } finally {
    owner.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});


async function syncDataDuringAttachment(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange, targetPath: string) {
  const objectId = 'user_space:mac:desktop:*:search_aliases_document';
  const payload = buildCanonicalSettingSyncPayload({ form_factor: 'desktop', host_name: '*',
    key: 'search_aliases_document', platform: 'mac', scope: 'user_space', value_json: '"Changed between slices"' });
  await host.write(db => db.transaction(tx => applySyncObjectInTransaction(tx, {
    object_type: 'setting', object_id: objectId, content_hash: computeSyncContentHash('setting', payload),
    deleted_at: null, payload_json: JSON.stringify(payload), updated_at: '2026-10-16'
  })));
  const inventories = await exchangeRequestSyncInventory(host, exchange);
  const difference = compareFramedSyncDatabaseInventories(inventories).find(item => item.globalId === objectId);
  expect(difference).toBeDefined();
  await pushRequestSyncObject(host, exchange, difference!);
  const target = new Database(targetPath, { readonly: true });
  try {
    expect(target.prepare('SELECT value_json FROM setting_records WHERE key = ?').get('search_aliases_document'))
      .toEqual({ value_json: '"Changed between slices"' });
  } finally { target.close(); }
}


async function runSlice(local: Awaited<ReturnType<typeof attachmentHttpSource>>,
  owner: ReturnType<typeof createSyncPeerRoundOwnership>, endpointUrl: string, targetPath: string, index: number) {
  const id = crypto.randomUUID();
  const lease = owner.acquireOutbound('local', id);
  if (!lease) throw new Error('test_owner_not_released');
  const peerRound = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  try {
    const result = await withRequestSyncPeerRound(exchange, peerRound,
      async () => {
        if (index === 1) await syncDataDuringAttachment(local.database, exchange, targetPath);
        const release = waitForAttachmentWorkYield();
        try {
          return await exchangeRequestSyncAttachments(local.host, exchange, (_key, error) => { throw error; });
        } finally { release(); }
      });
    expect(result).toMatchObject([
      { blocks: 2, pending: 2, transferred: 0 }, { blocks: 2, pending: 2, transferred: 0 },
      { blocks: 2, pending: 1, transferred: 1 }, { blocks: 1, pending: 0, transferred: 1 }
    ][index]!);
    if (index === 0) {
      const signal = AbortSignal.abort(new Error('cancelled_between_slices'));
      await expect(exchangeRequestSyncAttachments(local.host, { ...exchange, signal }, () => {}))
        .rejects.toThrow('cancelled_between_slices');
    }
  } finally { lease.release(); }
}
