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

import { attachmentSourceVerification } from '../../lib/core/sync/attachmentSourceVerification.js';
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


it.each([{ mbps: 5, rttMs: 80, initialScan: false }, { mbps: 5, rttMs: 80, initialScan: true }])(
  'admits text at $mbps Mbps / $rttMs ms during initial scan=$initialScan', async profile => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const { local, target } = await prepareScale(directory.root, profile.initialScan ? 64 : 4);
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
  let pendingRecord: ReturnType<typeof textBranch> | undefined;
  const onRead = async () => {
    if (requestedAt) return;
    requestedAt = performance.now(); releaseWaiter = waitForAttachmentWorkYield();
    pendingRecord = textBranch(crypto.randomUUID(), `Body changed during initial scan ${crypto.randomUUID()}`);
    pendingRecord.object_id = 'scan-edit'; pendingRecord.snapshot.id = 'scan-edit';
    await local.database.write(db => applyConvergentSyncNodesWithDbPort(db, [pendingRecord!]));
  };
  attachmentSourceVerification.invalidate();
  const sourceSpy = profile.initialScan ? observeInitialScan(onRead) : observeFirstSourceRead(onRead);
  const relay = await slowNetworkRelay(server.url, profile);
  const host = local.host;
  try {
    baselineMs = await measureBaseline(owner, relay.url, local.database, target.databasePath);
    while (!editLatencyMs) {
      const { lease, peerRound, exchange } = openScaleRound(owner, relay.url);
      try {
        await withRequestSyncPeerRound(exchange, peerRound, async () => {
          if (requestedAt && !editLatencyMs) {
            releaseWaiter?.(); releaseWaiter = undefined;
            await syncDataDuringAttachment(local.database, exchange, target.databasePath, pendingRecord);
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
    await recordDiagnostic({ profile, baselineMs, rounds, totalBlocks, releasedAt, requestedAt,
      editLatencyMs, elapsedMs: performance.now() - started, transport: relay.metrics });
  } finally {
    sourceSpy.mockRestore();
    releaseWaiter?.(); requestAttachmentWorkYield(); owner.close(); await relay.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
}, 240000);

async function syncDataDuringAttachment(host: RequestSyncDatabaseHost, exchange: RequestSyncExchange, targetPath: string, existing?: ReturnType<typeof textBranch>) {
  const objectId = existing?.object_id ?? `timing-${crypto.randomUUID()}`;
  const body = existing?.snapshot.content ?? `Complete diagnostic body ${crypto.randomUUID()}\nEnd of body.`;
  const record = existing ?? textBranch(crypto.randomUUID(), body);
  record.object_id = objectId;
  record.snapshot.id = objectId;
  if (!existing) await host.write(db => applyConvergentSyncNodesWithDbPort(db, [record]));
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



async function prepareScale(root: string, mebibytes: number) {
  const bytes = Buffer.alloc(mebibytes * 1024 * 1024, 0x43);
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

function observeFirstSourceRead(onRead: () => Promise<void>) {
  const originalSource = attachmentSource.createDesktopAttachmentBlockSource;
  return vi.spyOn(attachmentSource, 'createDesktopAttachmentBlockSource').mockImplementation((assets, libraryIdentity) => {
    const source = originalSource(assets, libraryIdentity);
    return { withFile(key, consume, options) {
      return source.withFile(key, file => consume({ ...file, async read(offset, length) {
        await onRead();
        return file.read(offset, length);
      } }), options);
    } };
  });
}

function observeInitialScan(onRead: () => Promise<void>) {
  const verify = attachmentSourceVerification.verify.bind(attachmentSourceVerification);
  return vi.spyOn(attachmentSourceVerification, 'verify').mockImplementation((identity, file, shouldYield, hash) =>
    verify(identity, { ...file, async read(offset, length) {
      await onRead();
      return file.read(offset, length);
    } }, shouldYield, hash));
}

async function recordDiagnostic(input: {
  profile: { mbps: number; rttMs: number; initialScan: boolean }; baselineMs: number; rounds: number;
  totalBlocks: number; releasedAt: number; requestedAt: number; editLatencyMs: number; elapsedMs: number;
  transport: Awaited<ReturnType<typeof slowNetworkRelay>>['metrics'];
}) {
  const { profile, baselineMs, rounds, totalBlocks, releasedAt, requestedAt, editLatencyMs } = input;
    expect(editLatencyMs).toBeGreaterThan(0);
    expect(editLatencyMs).toBeLessThan(5000);
    expect(releasedAt - requestedAt).toBeLessThan(1100);
    if (profile.initialScan) expect(totalBlocks).toBe(0);
    else expect(totalBlocks).toBeGreaterThan(0);
    const metrics = { profile, attachmentNodeCount: 1, textEdits: 2, fixtureBytes: (profile.initialScan ? 256 : 16) * 1024 * 1024, rounds, totalBlocks,
      baselineMs: Math.round(baselineMs), attachmentBoundaryWaitMs: Math.round(releasedAt - requestedAt),
      editLatencyMs: Math.round(editLatencyMs), elapsedMs: Math.round(input.elapsedMs),
      transport: input.transport, note: 'Demand begins before the first source block read; excludes editor save and cadence; no packet loss injection' };
    await mkdir('.tmp/artifacts/t357-single-wait', { recursive: true });
    await writeFile(path.resolve(`.tmp/artifacts/t357-single-wait/network-${profile.mbps}mbps-${profile.initialScan ? 'initial' : 'send'}.json`), JSON.stringify(metrics, null, 2));
}

async function measureBaseline(owner: ReturnType<typeof createSyncPeerRoundOwnership>, url: string,
  host: RequestSyncDatabaseHost, databasePath: string) {
  const baseline = openScaleRound(owner, url);
  try {
    const start = performance.now();
    await withRequestSyncPeerRound(baseline.exchange, baseline.peerRound,
      () => syncDataDuringAttachment(host, baseline.exchange, databasePath));
    return performance.now() - start;
  } finally { baseline.lease.release(); }
}
