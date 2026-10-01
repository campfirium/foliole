// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../../../electron/database/connection.js';
import { permanentlyDelete } from '../../../electron/database/dynamicNodeVersionChains.delete.testSupport.js';
import { assertPersisted, closeLibraries, createPeer, edit, history, joinPeers,
  receiveBodies, root, startLibraries, type Peer } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from '../../../electron/database/syncPackBuilderTestSupport.js';
import { startAuthenticatedSyncHttp } from '../../../electron/sync/companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady, revokeDesktopSyncGroupMemberStateReadiness }
  from '../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from '../../../electron/sync/syncPackContainerReader.js';
import { loadPendingNodeVersionReceipts, markNodeVersionReceiptDelivered } from '../../../lib/core/sync/nodeVersionInboundReceipt.js';
import { dependencyResumeUrl } from '../../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../../lib/core/sync/syncPackFactPresence.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { loadSyncPackReceiveProgress } from '../../../lib/core/sync/syncPackReceiveProgress.js';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract.js';

import { createCompanionSyncbackDbStore } from './companion/sync/syncback/companionSyncbackDbStore.js';
import { nodeVersionSyncAdapter, type SyncPushAck } from './companionSyncPushProtocol.js';

vi.mock('../../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../../../electron/sync/workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('../../../electron/sync/workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
vi.mock('../../../electron/sync/workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: () => {} }));
setupSyncPackBuilderTestLifecycle();
beforeEach(startLibraries);
afterEach(closeLibraries);

function sourcePeer(): Peer {
  const { sqlite: db, driver } = openDatabaseConnection();
  const anchor = randomUUID();
  const id = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group',
    library_path: db.name, path_flavor: 'posix' }).identity_key;
  return { id, name: 'source', anchor, file: db.name, db, driver, port: createBetterSqliteDbPort(db) };
}

async function requestUrl(server: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>, after: number) {
  const facts = new URL(`/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=${after}`, server.origin);
  const url = new URL(`/companion/sync-pack?page_contract=bounded-v1&after_state_seq=${after}`, server.origin);
  let response = await server.getJson(facts.pathname + facts.search);
  while (response.index) {
    const index = response.index as SyncPackFactIndex;
    const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
    for (const [key, value] of Object.entries({ fact_view: String(response.source_view_id),
      fact_index_id: index.index_id, have_v: bits.versions, have_p: bits.parents, have_r: bits.reviews })) facts.searchParams.set(key, value);
    response = await server.getJson(facts.pathname + facts.search);
  }
  if (response.ready) url.searchParams.set('fact_view', String(response.source_view_id));
  else {
    const index = response as unknown as SyncPackFactIndex;
    const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
    for (const [key, value] of Object.entries({ fact_index_id: index.index_id,
      have_v: bits.versions, have_p: bits.parents, have_r: bits.reviews,
      frontier_state_seq: String(index.frontier_state_seq), source_epoch: index.source_epoch,
      ...(index.round_source_view_id ? { round_source_view_id: index.round_source_view_id } : {}) })) url.searchParams.set(key, value);
  }
  return url;
}

async function pull(server: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>, source: Peer, target: Peer) {
  const after = (await loadSyncPackReceiveProgress(target.port, source.id)).progress?.cursorStateSeq ?? 0;
  const url = await requestUrl(server, after);
  let next = url;
  for (let page = 0; page < 10; page++) {
    const archive = await server.archive(next);
    const incoming = path.join(root, `${randomUUID()}.db`);
    await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath, outputPath: incoming,
      expectedPeerId: target.id, expectedSourcePeerId: source.id, maxDatabaseBytes: 4 * 1024 * 1024 });
    await archive.cleanup();
    target.db.prepare('ATTACH DATABASE ? AS inc').run(incoming);
    let result;
    try {
      result = await applySyncPackNodeSurfaceWithDbPort(target.port, { currentCursor: after,
        hostName: target.name, sourcePeerId: source.id, recordVersionReceipt: true, enqueueSearchInvalidations: false });
    } finally { target.db.exec('DETACH DATABASE inc'); }
    if (!result.dependencyProgress) break;
    next = new URL(dependencyResumeUrl(next.toString(), result.dependencyProgress));
    expect(page).toBeLessThan(9);
  }
  await receiveBodies(source, target);
  for (const receipt of await loadPendingNodeVersionReceipts(target.port, source.id)) {
    expect(await server.postJson('/companion/version-pack-receipt', receipt)).toMatchObject({ accepted: true });
    await markNodeVersionReceiptDelivered(target.port, receipt.packId);
  }
}

it('merges an offline edit over authenticated HTTP and retains only each direct acknowledged base', async () => {
  const source = sourcePeer();
  const target = createPeer('target');
  joinPeers(source, target);
  target.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  target.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(target.name);
  markDesktopSyncGroupMemberStateReady(target.id);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: source.id, receiverDeviceId: target.id, archiveDir: root });
  try {
    const base = edit(source, 'left\nright\n');
    await pull(server, source, target);
    const retired = edit(source, 'left-middle\nright\n');
    edit(source, 'left-online\nright\n');
    expect(history(source).find((row) => row.version_id === retired)).toBeUndefined();
    const offline = edit(target, 'left\nright-offline\n');
    const store = createCompanionSyncbackDbStore({ ...target.port, query: (sql, params = []) => {
      const values: (typeof params)[number][] = [];
      const normalized = sql.replace(/\?(\d+)/g, (_, index: string) => {
        values.push(params[Number(index) - 1]!);
        return '?';
      });
      return target.port.query(normalized, values.length ? values : params);
    } });
    const payloads = (await store.loadNodeVersions(source.id, null)).map((record) => nodeVersionSyncAdapter.buildPushPayload(record));
    expect(payloads.map((item) => item.clientOpId)).toEqual(expect.arrayContaining([`node:${base}`, `node:${offline}`]));
    await store.stagePushItems(source.id, payloads);
    const response = await server.postJson('/companion/sync-push', { items: payloads });
    const acks = (response.acks as Array<Record<string, unknown>>).map((ack) => ({
      ...ack, clientOpId: ack.client_op_id, versionId: ack.version_id
    })) as SyncPushAck[];
    expect(acks.every((ack) => ack.status === 'accepted' || ack.status === 'already_applied')).toBe(true);
    await store.savePushAcks(source.id, acks);
    await pull(server, source, target);
    assertPersisted(source, 'left-online\nright-offline\n');
    assertPersisted(target, 'left-online\nright-offline\n');
    expect(history(source)).toHaveLength(1);
    expect(history(target)).toHaveLength(1);
  } finally {
    await server.close();
    revokeDesktopSyncGroupMemberStateReadiness(target.id);
  }
});

it('propagates a physical deletion over authenticated HTTP and advances the direct peer base', async () => {
  const source = sourcePeer();
  const target = createPeer('target');
  joinPeers(source, target);
  markDesktopSyncGroupMemberStateReady(target.id);
  const server = await startAuthenticatedSyncHttp({ sourceDeviceId: source.id, receiverDeviceId: target.id, archiveDir: root });
  try {
    const base = edit(source, 'body');
    await pull(server, source, target);
    const tomb = permanentlyDelete(source);
    expect(history(source).map(row => row.version_id)).toContain(base);
    await pull(server, source, target);
    for (const peer of [source, target]) {
      expect(peer.db.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
      expect(history(peer).map(row => [row.version_id, row.body_text, row.parent_version_id]))
        .toEqual([[tomb.version_id, 'body', null]]);
      expect(peer.db.pragma('foreign_key_check')).toEqual([]);
    }
  } finally {
    await server.close();
    revokeDesktopSyncGroupMemberStateReadiness(target.id);
  }
});
