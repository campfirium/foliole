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
import { waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { exchangeRequestSyncInventory, pullRequestSyncObject, pushRequestSyncObject, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';
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
  // This scenario exercises resumable transfer with data priority after bounded demand preparation.
  await local.host.needsSlice(() => false);
  await runWithDatabaseConnectionOwner(async () => {
    const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
    await readRequestSyncAttachmentNeedsSlice({ readSnapshot: read => db.transaction(read), write: write => write(db) },
      keys => Promise.all(keys.map(key => isDesktopAttachmentPresent(target.assetsDir, key))), () => false);
  });
  await local.host.withFile(keys[0]!, async () => undefined);
  await createDesktopAttachmentBlockSource(target.assetsDir, target.databasePath).withFile(keys[1]!, async () => undefined);
  const server = await attachmentHttpServer(0);
  const owner = createSyncPeerRoundOwnership(60_000);
  try {
    for (let index = 0; index < 7; index++) {
      await runSlice(local, owner, server.url, target.databasePath, index);
      if (index === 0) {
        const prefix = await readFile(path.join(local.assetsDir, `.attachment-${keys[1]!.slice(0, 64)}.partial`));
        expect(prefix.length).toBe(ATTACHMENT_BLOCK_BYTES);
        await expect(readFile(path.join(target.assetsDir, `.attachment-${keys[0]!.slice(0, 64)}.partial`)))
          .rejects.toMatchObject({ code: 'ENOENT' });
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


async function syncDataDuringAttachment(local: Awaited<ReturnType<typeof attachmentHttpSource>>,
  exchange: RequestSyncExchange, targetPath: string, index: number) {
  const bodies = [`Local edit ${index}\nComplete body.`, `Remote edit ${index}\nComplete body.`];
  const write = async (db: ReturnType<typeof createBetterSqliteDbPort>, side: number) => {
    const id = `text-${side}`;
    const parent = await loadCurrentSyncNodeRecord(db, id);
    const record = textBranch(`v-${side}-${index}`, bodies[side]!, parent ?? undefined);
    record.object_id = id; record.snapshot.id = id;
    await applyConvergentSyncNodesWithDbPort(db, [record]);
  };
  await local.database.write(db => write(db, 0));
  await runWithDatabaseConnectionOwner(() => write(createBetterSqliteDbPort(openDatabaseConnection().sqlite), 1));
  const differences = compareFramedSyncDatabaseInventories(await exchangeRequestSyncInventory(local.database, exchange));
  await pushRequestSyncObject(local.database, exchange, differences.find(item => item.globalId === 'text-0' && item.direction === 'local_to_remote')!);
  await pullRequestSyncObject(local.database, exchange, differences.find(item => item.globalId === 'text-1' && item.direction === 'remote_to_local')!, { peerState: {
    contract_version: 3, group_id: 'group', sender_device_identity_key: 'local',
    library_epoch: 'local-epoch', proof_revision: 0, source_proof_revisions: {},
    devices: [], removals: [], restore: null
  } });
  for (const databasePath of [local.databasePath, targetPath]) {
    const reader = new Database(databasePath, { readonly: true });
    try {
      for (let side = 0; side < 2; side++) expect(reader.prepare('SELECT content FROM nodes WHERE id=?').get(`text-${side}`))
        .toEqual({ content: bodies[side] });
    } finally { reader.close(); }
  }
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
        await syncDataDuringAttachment(local, exchange, targetPath, index);
        const release = waitForAttachmentWorkYield();
        try {
          return await exchangeRequestSyncAttachments(local.host, exchange, (_key, error) => { throw error; });
        } finally { release(); }
      });
    expect(result.blocks, `round ${index}: ${JSON.stringify(result)}`).toBe(1);
    if (index < 6) expect(result.pending).not.toBe(0);
    // Pending parsing is independent of transfer completion while every round also edits two articles.
    if (index === 0) {
      const signal = AbortSignal.abort(new Error('cancelled_between_slices'));
      await expect(exchangeRequestSyncAttachments(local.host, { ...exchange, signal }, () => {}))
        .rejects.toThrow('cancelled_between_slices');
    }
  } finally { lease.release(); }
}
