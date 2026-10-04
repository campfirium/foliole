// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner,
  type DatabaseConnection } from '../database/connection.js';
import { insertNodeSyncState, mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { openContinuationReceiver } from './desktopResourceArticleContinuation.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { assertIdentityPushApplied, assertOlderIdRelayedAfterBaseline, assertTypedIdentityCandidates,
  captureIdentityPositionRelay, identityPositionCandidate, seedIdentityGroup, seedReceiverOnlyIdentityNode, seedRetainedIdentityBranch } from './desktopSyncIdentityHttp.testSupport.js';
import { downloadAndApplyDesktopSyncIdentityPage } from './desktopSyncIdentityPack.js';
import { probeDesktopSyncIdentities } from './desktopSyncIdentityProbe.js';
import { exchangeDesktopSyncIdentityCandidatePages,
  runDesktopSyncIdentityRound } from './desktopSyncIdentityRound.js';

const fixture = vi.hoisted(() => ({
  routing: null as AsyncLocalStorage<DatabaseConnection> | null,
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));
vi.mock('../database/connection.js', async (original) => {
  const actual = await original<typeof import('../database/connection.js')>();
  return { ...actual,
    openDatabaseConnection: () => fixture.routing?.getStore() ?? actual.openDatabaseConnection(),
    runWithDatabaseConnectionOwner<T>(task: () => T | Promise<T>) {
      return fixture.routing?.getStore() ? Promise.resolve().then(task) : actual.runWithDatabaseConnectionOwner(task);
    }
  };
});
vi.mock('../database/hostProfile.js', () => ({ loadOrCreateDesktopHostName: () =>
  fixture.routing?.getStore() ? 'receiver' : 'source' }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: fixture.source,
  devices: [fixture.source, fixture.receiver].map((device_identity_key) => ({
    device_identity_key, state: 'active'
  }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
fixture.routing = new AsyncLocalStorage<DatabaseConnection>();
setupSyncPackBuilderTestLifecycle();

it('downloads a fixed identity page over authenticated HTTP and commits it on another database', async () => {
  insertNodeSyncState();
  seedIdentityGroup(fixture.source, fixture.receiver);
  const source = openDatabaseConnection();
  const receiverPath = resolveSyncPackPath('identity-http-receiver.db');
  await source.sqlite.backup(receiverPath);
  const receiver = openContinuationReceiver(receiverPath);
  receiver.sqlite.exec(`DELETE FROM node_sync_versions; DELETE FROM nodes;
    DELETE FROM sync_object_state WHERE object_type = 'node'`);
  receiver.sqlite.prepare('UPDATE sync_group_local_state SET local_device_identity_key = ?')
    .run(fixture.receiver);
  markDesktopSyncGroupMemberStateReady(fixture.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: fixture.source,
    receiverDeviceId: fixture.receiver });
  try {
    const summary = await http.getJson('/companion/sync-identity-summary');
    const partition = syncIdentityPartition('node', 'node-1');
    const remote = await http.getJson('/companion/sync-identity-page?' +
      new URLSearchParams({ source_view_id: String(summary.source_view_id),
        partition: String(partition) }));
    const identity = (remote.entries as Array<{ object_type: string;
      object_id: string; fingerprint: string }>).find((row) => row.object_id === 'node-1')!;
    const page = buildSyncIdentityPackPage({ group_id: 'group',
      source_peer_id: fixture.source, target_peer_id: fixture.receiver,
      source_view_id: String(summary.source_view_id), page_index: 0,
      previous_page_id: null, objects: [identity] });
    const peer = { endpoint_url: http.origin, group_id: 'group',
      local_device_id: fixture.receiver, peer_device_id: fixture.source,
      peer_device_name: 'Source', peer_platform: 'mac' };
    const result = await fixture.routing!.run(receiver, () =>
      downloadAndApplyDesktopSyncIdentityPage({ peer, page }));
    expect(result.applied).toBe(true);
    expect(receiver.sqlite.prepare("SELECT title FROM nodes WHERE id = 'node-1'").get())
      .toMatchObject({ title: 'Node 1' });
    expect(receiver.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get())
      .toEqual({ count: 1 });
    expect(receiver.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_pack_receive_progress').get())
      .toEqual({ count: 0 });
  } finally {
    await http.close();
    receiver.sqlite.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.receiver);
  }
}, 60_000);

it('transfers a retained branch when both current object fingerprints match', async () => {
  insertNodeSyncState();
  seedIdentityGroup(fixture.source, fixture.receiver);
  const source = openDatabaseConnection();
  const receiverPath = resolveSyncPackPath('fact-branch-receiver.db');
  await source.sqlite.backup(receiverPath);
  const receiver = openContinuationReceiver(receiverPath);
  receiver.sqlite.prepare('UPDATE sync_group_local_state SET local_device_identity_key = ?')
    .run(fixture.receiver);
  seedRetainedIdentityBranch(source);
  markDesktopSyncGroupMemberStateReady(fixture.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: fixture.source,
    receiverDeviceId: fixture.receiver });
  try {
    const peer = { endpoint_url: http.origin, group_id: 'group',
      local_device_id: fixture.receiver, peer_device_id: fixture.source,
      peer_device_name: 'Source' };
    const probe = await fixture.routing!.run(receiver, () => probeDesktopSyncIdentities({
      endpointUrl: http.origin, groupId: 'group', localDatabase: receiver.sqlite,
      localDeviceId: fixture.receiver, outputRoot: resolveSyncPackPath('probe-branch'),
      secret: Buffer.alloc(32, 7).toString('base64url')
    }));
    try {
      const sourcePosition = identityPositionCandidate(source.sqlite, { nodeId: 'node-1', owner: fixture.source,
        head: 'desktop#node-1-v1', pending: ['desktop#node-1-branch'], kind: 'source_only' });
      const receiverPosition = identityPositionCandidate(receiver.sqlite, { nodeId: 'node-1', owner: fixture.receiver,
        head: 'desktop#node-1-v1', pending: [], kind: 'receiver_only' });
      const counts = assertTypedIdentityCandidates(probe.candidatePath, [sourcePosition, receiverPosition,
        { object_type: 'node', object_id: 'node-1', kind: 'divergent' }]);
      expect(probe.count).toBe(counts.total);
      const assertPositions = await captureIdentityPositionRelay(source.sqlite, receiver.sqlite, sourcePosition.object_id, receiverPosition.object_id);
      const result = await fixture.routing!.run(receiver, () =>
        exchangeDesktopSyncIdentityCandidatePages({ candidate: probe, peer }));
      expect(result.received.pageCount).toBe(1);
      expect(receiver.sqlite.prepare(`SELECT object_id FROM node_sync_versions
        WHERE version_id = 'desktop#node-1-branch'`).get()).toEqual({ object_id: 'node-1' });
      expect(receiver.sqlite.prepare(`SELECT parent_version_id FROM node_sync_version_parents
        WHERE version_id = 'desktop#node-1-branch'`).get())
        .toEqual({ parent_version_id: 'desktop#node-1-v1' });
      await assertPositions();
    } finally { await probe.cleanup(); }
  } finally {
    await http.close();
    receiver.sqlite.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.receiver);
  }
}, 60_000);

it('exchanges source-only and receiver-only candidates as contiguous identity pages', async () => {
  insertNodeSyncState();
  seedIdentityGroup(fixture.source, fixture.receiver);
  const source = openDatabaseConnection();
  const receiverPath = resolveSyncPackPath('identity-pages-receiver.db');
  await source.sqlite.backup(receiverPath);
  const receiver = openContinuationReceiver(receiverPath);
  seedReceiverOnlyIdentityNode(receiver);
  receiver.sqlite.prepare('UPDATE sync_group_local_state SET local_device_identity_key = ?')
    .run(fixture.receiver);
  markDesktopSyncGroupMemberStateReady(fixture.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: fixture.source,
    receiverDeviceId: fixture.receiver });
  try {
    const peer = { endpoint_url: http.origin, group_id: 'group',
      local_device_id: fixture.receiver, peer_device_id: fixture.source,
      peer_device_name: 'Source', peer_platform: 'mac' };
    const probe = await fixture.routing!.run(receiver, () => probeDesktopSyncIdentities({
      endpointUrl: http.origin, groupId: 'group', localDatabase: receiver.sqlite,
      localDeviceId: fixture.receiver, outputRoot: resolveSyncPackPath('probe-pages'),
      secret: Buffer.alloc(32, 7).toString('base64url')
    }));
    try {
      const sourcePosition = identityPositionCandidate(source.sqlite, { nodeId: 'node-1', owner: fixture.source,
        head: 'desktop#node-1-v1', pending: [], kind: 'source_only' });
      const receiverPosition = identityPositionCandidate(receiver.sqlite, { nodeId: 'node-2', owner: fixture.receiver,
        head: 'receiver#node-2-v1', pending: [], kind: 'receiver_only' });
      const counts = assertTypedIdentityCandidates(probe.candidatePath, [sourcePosition, receiverPosition,
        { object_type: 'node', object_id: 'node-1', kind: 'source_only' },
        { object_type: 'node', object_id: 'node-2', kind: 'receiver_only' },
        { object_type: 'setting', object_id: 'user_space:windows:desktop:*:app_settings', kind: 'source_only' }]);
      expect(probe.count).toBe(counts.total);
      const result = await fixture.routing!.run(receiver, () =>
        exchangeDesktopSyncIdentityCandidatePages({ candidate: probe, peer, limit: 1 }));
      expect(result).toEqual({ received: { appliedPages: counts.source, pageCount: counts.source },
        sent: { appliedPages: counts.receiver, pageCount: counts.receiver } });
      expect(receiver.sqlite.prepare(`SELECT last_page_index FROM sync_identity_receive_rounds
        WHERE source_peer_id = ?`).get(fixture.source)).toEqual({ last_page_index: counts.source - 1 });
      expect(receiver.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_identity_pack_receipts').get())
        .toEqual({ count: counts.source });
      await runWithDatabaseConnectionOwner(() => {
        assertIdentityPushApplied(source, counts.receiver);
      });
      await fixture.routing!.run(receiver, () => runDesktopSyncIdentityRound(peer));
      await assertOlderIdRelayedAfterBaseline({ source, receiver, peer,
        sourceId: fixture.source,
        runRound: () => fixture.routing!.run(receiver, () => runDesktopSyncIdentityRound(peer)) });
    } finally { await probe.cleanup(); }
  } finally {
    await http.close();
    receiver.sqlite.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.receiver);
  }
}, 60_000);
