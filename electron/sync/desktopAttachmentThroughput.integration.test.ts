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
import { parseChangedAttachmentArticles } from '../../lib/core/sync/attachmentDemandQueue.js';
import { attachmentSourceVerification } from '../../lib/core/sync/attachmentSourceVerification.js';
import { requestAttachmentWorkYield, waitForAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { buildCanonicalSettingSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { exchangeRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { exchangeRequestSyncInventory, pushRequestSyncObject, type RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import * as resourceFileHash from './resourceFileHash.js';


function seedScale(sqlite: Database.Database) {
  const node = sqlite.prepare(`INSERT INTO nodes
    (id, title, content, created_at, updated_at, current_version_id) VALUES (?, 'Scale', ?, 'now', 'now', 'scale')`);
  const digest = sqlite.prepare('INSERT INTO framed_sync_node_digest (object_id, shared_state_hash, unready) VALUES (?, ?, 0)');
  sqlite.transaction(() => {
    for (let i = 0; i < 30000; i++) {
      const id = `scale-${String(i).padStart(6, '0')}`;
      node.run(id, 'body '.repeat(100));
      digest.run(id, createHash('sha256').update(id).digest('hex'));
    }
  })();
}

it('streams 256 MiB with 30000-node demand and inventory fixtures while admitting a data edit', async () => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const { local, target, keys } = await prepareScale(directory.root);
  const server = await attachmentHttpServer(0);
  const owner = createSyncPeerRoundOwnership(60000);
  const measurement = measureSourceWork();
  const started = performance.now();
  let rounds = 0;
  let totalBlocks = 0;
  let streamingProved = false;
  let requestedAt = 0;
  let editLatencyMs = 0;
  let releaseWaiter: (() => void) | undefined;
  const host = { ...local.host, async receive(...args: Parameters<typeof local.host.receive>) {
    const result = await local.host.receive(...args);
    if (!requestedAt) { requestedAt = performance.now(); releaseWaiter = waitForAttachmentWorkYield(); }
    return result;
  } };
  try {
    let pending: number | null = 1;
    while (pending !== 0) {
      const { lease, peerRound, exchange } = openScaleRound(owner, server.url);
      try {
        await withRequestSyncPeerRound(exchange, peerRound, async () => {
          if (requestedAt && !editLatencyMs) {
            releaseWaiter?.(); releaseWaiter = undefined;
            await syncDataDuringAttachment(local.database, exchange, target.databasePath);
            editLatencyMs = performance.now() - requestedAt;
          }
          const result = await exchangeRequestSyncAttachments(host, exchange, (_key, error) => { throw error; });
          if (editLatencyMs && result.blocks > 2) streamingProved = true;
          pending = result.pending; totalBlocks += result.blocks;
        });
      } finally { lease.release(); }
      if (++rounds > 100) throw new Error('attachment_throughput_round_budget_exceeded');
    }
    for (const key of keys) for (const root of [local.assetsDir, target.assetsDir]) {
      expect(createHash('sha256').update(await readFile(path.join(root, key))).digest('hex')).toBe(key.slice(0, 64));
    }
    expect(streamingProved).toBe(true);
    expect(totalBlocks).toBe(512);
    expect(rounds).toBeLessThan(128);
    expect(editLatencyMs).toBeGreaterThan(0);
    expect(editLatencyMs).toBeLessThan(5000);
    const metrics = { bytes: 256 * 1024 * 1024, nodesPerSide: 30000, rounds, totalBlocks,
      ...measurement.metrics(),
      elapsedMs: Math.round(performance.now() - started), editLatencyMs: Math.round(editLatencyMs) };
    await writeFile(path.resolve('.tmp/artifacts/t357-attachment-throughput.json'), JSON.stringify(metrics, null, 2));
  } finally {
    measurement.close();
    releaseWaiter?.(); requestAttachmentWorkYield(); owner.close(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
}, 240000);

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



async function prepareScale(root: string) {
  const bytes = Buffer.alloc(64 * 1024 * 1024, 0x43);
  const keys: string[] = [];
  for (let i = 0; i < 4; i++) { bytes[0] = i; keys.push(`${createHash('sha256').update(bytes).digest('hex')}.pdf`); }
  const local = await attachmentHttpSource(keys, root);
  await seedAttachmentTarget(keys);
  const target = resolveRuntimeDataPaths();
  seedScale(local.sqlite);
  await runWithDatabaseConnectionOwner(() => seedScale(openDatabaseConnection().sqlite));
  // Finish the synthetic import before measuring steady-library file transfer.
  await parseSeededArticles(local.sqlite);
  await runWithDatabaseConnectionOwner(() => parseSeededArticles(openDatabaseConnection().sqlite));
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

function measureSourceWork() {
  attachmentSourceVerification.invalidate();
  let sourceReadBytes = 0, sourceHashCalls = 0, sourceHashedBytes = 0, sourceFullHashes = 0;
  const receiverHashes = vi.spyOn(resourceFileHash, 'hashResourceFile');
  const verify = attachmentSourceVerification.verify.bind(attachmentSourceVerification);
  const hashCalls = vi.spyOn(attachmentSourceVerification, 'verify').mockImplementation((identity, file, yieldWork, createDigest) =>
    verify(identity, { ...file, async read(offset, length) {
      const bytes = await file.read(offset, length); sourceReadBytes += bytes.length; return bytes;
    } }, yieldWork, () => {
      sourceHashCalls++;
      const digest = createDigest!();
      let hashedBytes = 0;
      return { update(bytes) { sourceHashedBytes += bytes.length; hashedBytes += bytes.length; return digest.update(bytes); },
        digest() { if (hashedBytes > 512 * 1024) sourceFullHashes++; return digest.digest(); } };

    }));
  return { close: () => { hashCalls.mockRestore(); receiverHashes.mockRestore(); }, metrics: () => ({
    sourceHashCalls, sourceReadBytes, sourceHashedBytes, sourceFullHashes, receiverFullHashes: receiverHashes.mock.calls.length, sourceOpens: hashCalls.mock.calls.length
  }) };
}

async function parseSeededArticles(sqlite: Database.Database) {
  const db = createBetterSqliteDbPort(sqlite);
  await db.transaction(async tx => {
    const host = { readSnapshot: <T>(read: (port: typeof tx) => Promise<T>) => read(tx),
      write: <T>(write: (port: typeof tx) => Promise<T>) => write(tx) };
    while ((await tx.query('SELECT 1 FROM attachment_parse_queue LIMIT 1')).length) {
      await parseChangedAttachmentArticles(host, () => false);
    }
  });
}
