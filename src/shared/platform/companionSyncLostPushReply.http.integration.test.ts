// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../../../electron/database/connection.js';
import { assertPersisted, closeLibraries, createPeer, edit, joinPeers, receiveBodies,
  root, startLibraries, sync, type Peer } from '../../../electron/database/syncEmptyLibraryTestSupport.js';
import { mockedSyncPackBuilderAppDataDir, setupSyncPackBuilderTestLifecycle } from '../../../electron/database/syncPackBuilderTestSupport.js';
import { startAuthenticatedSyncHttp } from '../../../electron/sync/companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady, revokeDesktopSyncGroupMemberStateReadiness }
  from '../../../electron/sync/desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from '../../../electron/sync/syncPackContainerReader.js';
import type { DbParams, DbRow } from '../../../lib/core/sync/dbPort.js';
import { loadPendingNodeVersionReceipts, markNodeVersionReceiptDelivered } from '../../../lib/core/sync/nodeVersionInboundReceipt.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';
import { dependencyResumeUrl } from '../../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../../lib/core/sync/syncPackFactPresence.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { loadSyncPackReceiveProgress } from '../../../lib/core/sync/syncPackReceiveProgress.js';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract.js';

import { createCompanionSyncbackDbStore } from './companion/sync/syncback/companionSyncbackDbStore.js';
import type { SyncPushAck } from './companionSyncPushProtocol.js';

const runtime = vi.hoisted(() => ({
  desktop: null as Peer | null, mobile: null as Peer | null,
  server: null as Awaited<ReturnType<typeof startAuthenticatedSyncHttp>> | null,
  loseNextReply: false, dropReply: false, committedVersion: '', laterVersion: ''
}));

vi.mock('../../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../../../electron/sync/workgroupKeyStore.js', async original => ({
  ...await original<typeof import('../../../electron/sync/workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
vi.mock('../../../electron/sync/workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: () => {} }));
vi.mock('./companion/network/signedRequest.js', () => ({ createSignedRequestHeaders: async () => ({}) }));
vi.mock('./companion/network/syncGroupPeerIdentity.js', () => ({
  resolveCompanionSyncPeerId: async () => runtime.desktop!.id,
  resolveCompanionSyncPeerHostName: async () => runtime.desktop!.name
}));
vi.mock('./companionDesktopSyncHttp.js', () => ({
  postDesktopJson: async (_endpoint: string, route: string, body: unknown) => {
    const response = await runtime.server!.postJson(route, body);
    if (runtime.loseNextReply && route === '/companion/sync-push') {
      runtime.loseNextReply = false;
      expect(await loadCurrentSyncNodeRecord(runtime.desktop!.port, 'topic'))
        .toMatchObject({ body_text: 'Mobile saved body', version_id: runtime.committedVersion });
      runtime.laterVersion = edit(runtime.desktop!, 'Later desktop body');
      if (runtime.dropReply) throw new Error('injected_push_reply_lost_after_commit');
    }
    return response;
  }
}));
vi.mock('./companionSyncObjects.js', () => ({
  loadCompanionSyncNodeVersions: (peerId: string, _cursor: unknown, limit: number) => store().loadNodeVersions(peerId, null, limit),
  loadCompanionSyncStateChanges: async () => [], loadCompanionSyncReviewLog: async () => [],
  stageCompanionSyncPushItems: (peerId: string, items: Parameters<ReturnType<typeof store>['stagePushItems']>[1]) =>
    store().stagePushItems(peerId, items),
  saveCompanionSyncPushAcks: (peerId: string, acks: SyncPushAck[]) => store().savePushAcks(peerId, acks),
  loadCompanionSyncPackPosition: async (peerId: string) => ({
    cursor: (await loadSyncPackReceiveProgress(runtime.mobile!.port, peerId)).progress?.cursorStateSeq ?? 0
  }),
  saveCompanionSyncPackCursor: async (cursor: number) => cursor,
  applyCompanionDesktopSyncPack: ({ url }: { url: string }) => pull(new URL(url))
}));
setupSyncPackBuilderTestLifecycle();
beforeEach(startLibraries);
afterEach(closeLibraries);

function store() {
  const port = runtime.mobile!.port;
  return createCompanionSyncbackDbStore({ ...port, query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
    const values: (typeof params)[number][] = [];
    const normalized = sql.replace(/\?(\d+)/g, (_match, index: string) => {
      values.push(params[Number(index) - 1]!);
      return '?';
    });
    return port.query<T>(normalized, values.length ? values : params);
  } });
}

function desktopPeer(): Peer {
  const { sqlite: db, driver } = openDatabaseConnection();
  const anchor = randomUUID();
  const id = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group',
    library_path: db.name, path_flavor: process.platform === 'win32' ? 'windows' : 'posix' }).identity_key;
  return { id, name: 'desktop', anchor, file: db.name, db, driver, port: createBetterSqliteDbPort(db) };
}

async function prepareUrl(url: URL) {
  const server = runtime.server!;
  const facts = new URL(url);
  facts.pathname = '/companion/sync-pack-facts';
  let response = await server!.getJson(facts.pathname + facts.search);
  while (response.index) {
    const index = response.index as SyncPackFactIndex;
    const bits = encodeSyncPackFactClaims(index, { versions: [], parents: [], reviews: [] });
    for (const [key, value] of Object.entries({ fact_view: String(response.source_view_id),
      fact_index_id: index.index_id, have_v: bits.versions, have_p: bits.parents, have_r: bits.reviews })) facts.searchParams.set(key, value);
    response = await server!.getJson(facts.pathname + facts.search);
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

async function applyPage(url: URL, currentCursor: number) {
  const { desktop, mobile, server } = runtime;
  const archive = await server!.archive(url);
  const incoming = path.join(root, `${randomUUID()}.db`);
  await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath, outputPath: incoming,
    expectedPeerId: mobile!.id, expectedSourcePeerId: desktop!.id, maxDatabaseBytes: 4 * 1024 * 1024 });
  await archive.cleanup();
  mobile!.db.prepare('ATTACH DATABASE ? AS inc').run(incoming);
  let result;
  try {
    result = await applySyncPackNodeSurfaceWithDbPort(mobile!.port, { currentCursor,
      hostName: mobile!.name, sourcePeerId: desktop!.id, recordVersionReceipt: true, enqueueSearchInvalidations: false });
  } finally { mobile!.db.exec('DETACH DATABASE inc'); }
  return result;
}

async function pull(url: URL) {
  const { desktop, mobile, server } = runtime;
  const currentCursor = Number(url.searchParams.get('after_state_seq'));
  let next = await prepareUrl(url);
  let result = await applyPage(next, currentCursor);
  for (let page = 0; result.dependencyProgress; page++) {
    expect(page).toBeLessThan(49);
    next = new URL(dependencyResumeUrl(next.toString(), result.dependencyProgress));
    result = await applyPage(next, currentCursor);
  }
  await receiveBodies(desktop!, mobile!);
  for (const receipt of await loadPendingNodeVersionReceipts(mobile!.port, desktop!.id)) {
    expect(await server!.postJson('/companion/version-pack-receipt', receipt)).toMatchObject({ accepted: true });
    await markNodeVersionReceiptDelivered(mobile!.port, receipt.packId);
  }
  return { ...result, applied_blob_count: result.appliedBlobCount,
    applied_object_count: result.appliedObjectCount, to_state_seq: result.toStateSeq,
    applied_group_fact_count: result.appliedGroupFactCount, handled_conflict_count: result.handledConflictCount,
    frontier_state_seq: result.frontierStateSeq, source_epoch: result.sourceEpoch,
    verified_empty_page: 'verifiedEmptyPage' in result && result.verifiedEmptyPage === true };
}

it.each([false, true])('keeps a committed mobile push from resurfacing after a later desktop edit, reopen, and retry (replyLost=%s)', async replyLost => {
  const desktop = desktopPeer();
  const mobile = createPeer('mobile');
  joinPeers(desktop, mobile);
  mobile.db.exec('CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  mobile.db.prepare("INSERT INTO companion_meta VALUES ('host_name', ?, 'now')").run(mobile.name);
  edit(desktop, 'Original body');
  await sync(desktop, mobile);
  runtime.desktop = desktop;
  runtime.mobile = mobile;
  runtime.committedVersion = edit(mobile, 'Mobile saved body');
  runtime.loseNextReply = true;
  runtime.dropReply = replyLost;
  markDesktopSyncGroupMemberStateReady(mobile.id);
  runtime.server = await startAuthenticatedSyncHttp({ sourceDeviceId: desktop.id, receiverDeviceId: mobile.id, archiveDir: root });
  try {
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects.js');
    const first = syncCompanionObjectsFromDesktop(runtime.server.origin, { includeResources: false });
    expect(syncCompanionObjectsFromDesktop(runtime.server.origin, { includeResources: false })).toBe(first);
    expect(await first).toMatchObject({ pushError: replyLost ? 'injected_push_reply_lost_after_commit' : null });
    assertPersisted(desktop, 'Later desktop body', runtime.laterVersion);
    assertPersisted(mobile, 'Later desktop body', runtime.laterVersion);
    mobile.db.close();
    mobile.db = new Database(mobile.file);
    mobile.db.pragma('foreign_keys = ON');
    mobile.driver = createBetterSqlite3Driver(mobile.db);
    mobile.port = createBetterSqliteDbPort(mobile.db);
    expect(await syncCompanionObjectsFromDesktop(runtime.server.origin, { includeResources: false }))
      .toMatchObject({ pushError: null, pushRejectedCount: 0 });
    for (const peer of [desktop, mobile]) {
      assertPersisted(peer, 'Later desktop body', runtime.laterVersion);
      expect(peer.db.prepare("SELECT body_text FROM node_text_alternatives WHERE node_id = 'topic' AND status = 'available'")
        .pluck().all()).toEqual([]);
    }
  } finally {
    await runtime.server.close();
    revokeDesktopSyncGroupMemberStateReadiness(mobile.id);
  }
});
