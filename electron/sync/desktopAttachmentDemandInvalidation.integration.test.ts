// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { exchangeRequestSyncInventory, pullRequestSyncObject } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionMaintenance,
  runWithDatabaseConnectionOwner } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

it('pulls a newly received node attachment during the existing backlog without recreating the demand cache', async () => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const bytes = [Buffer.alloc(3 * ATTACHMENT_BLOCK_BYTES, 0x61), Buffer.from('New remote attachment')];
  const keys = bytes.map(value => `${createHash('sha256').update(value).digest('hex')}.pdf`);
  const local = await attachmentHttpSource([keys[0]!], directory.root);
  await seedAttachmentTarget([keys[0]!]);
  const remoteDir = resolveRuntimeDataPaths().assetsDir;
  for (let i = 0; i < keys.length; i++) await writeFile(path.join(remoteDir, keys[i]!), bytes[i]!);
  const server = await attachmentHttpServer(0);
  const owner = createSyncPeerRoundOwnership(60_000);
  try {
    expect((await local.host.needsSlice(() => false)).keys).toEqual([keys[0]]);
    for (let round = 0; round < 2; round++) {
      if (round === 1) await addRemoteNode(keys[1]!);
      const id = crypto.randomUUID();
      const lease = owner.acquireOutbound('local', id);
      if (!lease) throw new Error('test_round_busy');
      const peerRound = { id, lease, admitted: false };
      const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
        groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
        context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
          initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
      try {
        await withRequestSyncPeerRound(exchange, peerRound, async () => {
          if (round === 1) {
            const differences = compareFramedSyncDatabaseInventories(await exchangeRequestSyncInventory(local.database, exchange));
            const difference = differences.find(item => item.globalId === 'new-remote-node');
            expect(difference).toBeDefined();
            await pullRequestSyncObject(local.database, exchange, difference!, { peerState: {
              contract_version: 3, group_id: 'group', sender_device_identity_key: 'local',
              library_epoch: 'local-epoch', proof_revision: 0, source_proof_revisions: {},
              devices: [], removals: [], restore: null
            } });
            expect(new Set((await local.host.needsSlice(() => false)).keys)).toEqual(new Set(keys));
          }
          const result = await exchangeRequestSyncAttachments(local.host, exchange,
            (_key, error) => { throw error; }, () => round === 0);
          if (round === 0) expect(result).toMatchObject({ blocks: 1, pending: 1 });
          else expect(result.pending).toBe(0);
        });
      } finally { lease.release(); }
    }
    for (let i = 0; i < keys.length; i++) expect(await readFile(path.join(local.assetsDir, keys[i]!))).toEqual(bytes[i]);
    expect(local.sqlite.prepare("SELECT id FROM nodes WHERE id = 'new-remote-node'").get()).toBeDefined();
  } finally {
    owner.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});

async function addRemoteNode(key: string) {
  await runWithDatabaseConnectionOwner(async () => {
    const { sqlite } = openDatabaseConnection();
    const record = textBranch('new-remote-version', `![attachment](asset://${key})`);
    record.object_id = 'new-remote-node'; record.snapshot.id = 'new-remote-node';
    await applyConvergentSyncNodesWithDbPort(createBetterSqliteDbPort(sqlite), [record]);
  });
}
