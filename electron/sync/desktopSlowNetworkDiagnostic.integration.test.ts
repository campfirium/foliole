// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { requestAttachmentWorkYield, waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { exchangeRequestSyncInventory, pushRequestSyncObject, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import * as attachmentSource from './desktopAttachmentBlockSource.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { slowNetworkRelay } from './slowNetworkDiagnostic.testSupport.js';


it.each([{ mbps: 20, rttMs: 40 }, { mbps: 5, rttMs: 80 }, { mbps: 1, rttMs: 150 }])(
  'records diagnostic timings for $mbps Mbps and $rttMs ms RTT', async profile => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const { local, target } = await prepareScale(directory.root);
  const server = await attachmentHttpServer(0);

  const owner = createSyncPeerRoundOwnership(60000);
  let baselineMs = 0;
  const started = performance.now();
  let rounds = 0;
  let totalBlocks = 0;
  let releasedAt = 0;
  let requestedAt = 0;
  let editLatencyMs = 0;
  let releaseWaiter: (() => void) | undefined;
  const sourceSpy = observeFirstSourceRead(() => {
    if (!requestedAt) { requestedAt = performance.now(); releaseWaiter = waitForAttachmentWorkYield(); }
  });
  const relay = await slowNetworkRelay(server.url, profile);
  const host = local.host;
  try {
    const baseline = openScaleRound(owner, relay.url);
    try {
      const start = performance.now();
      await withRequestSyncPeerRound(baseline.exchange, baseline.peerRound,
        () => syncDataDuringAttachment(local.database, baseline.exchange, target.databasePath));
      baselineMs = performance.now() - start;
    } finally { baseline.lease.release(); }
    while (!editLatencyMs) {
      const { lease, peerRound, exchange } = openScaleRound(owner, relay.url);
      try {
        await withRequestSyncPeerRound(exchange, peerRound, async () => {
          if (requestedAt && !editLatencyMs) {
            releaseWaiter?.(); releaseWaiter = undefined;
            await syncDataDuringAttachment(local.database, exchange, target.databasePath);
            editLatencyMs = performance.now() - requestedAt;
          }
          if (editLatencyMs) return;
          const result = await exchangeRequestSyncAttachments(host, exchange, (_key, error) => { throw error; });
          totalBlocks += result.blocks;
          if (requestedAt) releasedAt = performance.now();
        });
      } finally { lease.release(); }
      if (++rounds > 100) throw new Error('attachment_throughput_round_budget_exceeded');
    }
    expect(editLatencyMs).toBeGreaterThan(0);
    expect(totalBlocks).toBeGreaterThan(0);
    const metrics = { profile, attachmentNodeCount: 1, textEdits: 2, fixtureBytes: 16 * 1024 * 1024, rounds, totalBlocks,
      baselineMs: Math.round(baselineMs), attachmentBoundaryWaitMs: Math.round(releasedAt - requestedAt),
      editLatencyMs: Math.round(editLatencyMs), elapsedMs: Math.round(performance.now() - started),
      transport: relay.metrics, note: 'Demand begins before the first source block read; excludes editor save and cadence; no packet loss injection' };
    await mkdir('.tmp/artifacts/t357-single-wait', { recursive: true });
    await writeFile(path.resolve(`.tmp/artifacts/t357-single-wait/network-${profile.mbps}mbps.json`), JSON.stringify(metrics, null, 2));
  } finally {
    sourceSpy.mockRestore();
    releaseWaiter?.(); requestAttachmentWorkYield(); owner.close(); await relay.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
}, 240000);

async function syncDataDuringAttachment(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange, targetPath: string) {
  const objectId = `timing-${crypto.randomUUID()}`;
  const body = `Complete diagnostic body ${crypto.randomUUID()}\nEnd of body.`;
  const record = textBranch(crypto.randomUUID(), body);
  record.object_id = objectId;
  record.snapshot.id = objectId;
  await host.write(db => applyConvergentSyncNodesWithDbPort(db, [record]));
  const inventories = await exchangeRequestSyncInventory(host, exchange);
  const difference = compareFramedSyncDatabaseInventories(inventories).find(item => item.globalId === objectId);
  expect(difference).toBeDefined();
  await pushRequestSyncObject(host, exchange, difference!);
  const target = new Database(targetPath, { readonly: true });
  try {
    expect(target.prepare('SELECT content FROM nodes WHERE id = ?').get(objectId))
      .toEqual({ content: body });
  } finally { target.close(); }
}



async function prepareScale(root: string) {
  const bytes = Buffer.alloc(4 * 1024 * 1024, 0x43);
  const keys: string[] = [];
  for (let i = 0; i < 4; i++) { bytes[0] = i; keys.push(`${createHash('sha256').update(bytes).digest('hex')}.pdf`); }
  const local = await attachmentHttpSource(keys, root);
  await seedAttachmentTarget(keys);
  const target = resolveRuntimeDataPaths();
  for (let i = 0; i < keys.length; i++) {
    bytes[0] = i;
    await writeFile(path.join(i < 2 ? local.assetsDir : target.assetsDir, keys[i]!), bytes);
  }
  return { local, target, keys };
}

function openScaleRound(owner: ReturnType<typeof createSyncPeerRoundOwnership>, endpointUrl: string) {
  const id = crypto.randomUUID();
  const lease = owner.acquireOutbound('local', id);
  if (!lease) throw new Error('test_owner_not_released');
  const peerRound = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  return { lease, peerRound, exchange };
}

function observeFirstSourceRead(onRead: () => void) {
  const originalSource = attachmentSource.createDesktopAttachmentBlockSource;
  return vi.spyOn(attachmentSource, 'createDesktopAttachmentBlockSource').mockImplementation(assets => {
    const source = originalSource(assets);
    return { withFile(key, consume) {
      return source.withFile(key, file => consume({ ...file, async read(offset, length) {
        onRead();
        return file.read(offset, length);
      } }));
    } };
  });
}
