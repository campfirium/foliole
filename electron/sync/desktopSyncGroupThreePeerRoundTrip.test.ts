// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { saveCurrentLibraryHome } from '../ipc/libraryPathBootstrap.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { prepareMutationRoundPack } from './companionLanSourceMutation.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { addThreePeerReview, appendThreePeerVersion24, readThreePeerIncomingFacts,
  seedThreePeerVersions } from './desktopSyncGroupThreePeerHistory.testSupport.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

const fixture = vi.hoisted(() => ({ deviceId: 'A', root: '/tmp/foliole-three-peer',
  ids: {
    A: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/library-A']),
    B: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/library-B']),
    C: JSON.stringify([1, 'group', '33333333-3333-4333-8333-333333333333', '/library-C'])
  },
  anchors: {
    A: '11111111-1111-4111-8111-111111111111',
    B: '22222222-2222-4222-8222-222222222222',
    C: '33333333-3333-4333-8333-333333333333'
  }
}));
const peers = ['A', 'B', 'C'] as const;
const dbPaths = new Map<string, string>();

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: fixture.root,
  app_cache_dir: path.join(fixture.root, 'cache'),
  app_config_dir: path.join(fixture.root, 'config'),
  app_log_dir: path.join(fixture.root, 'logs'),
  documents_dir: fixture.root
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: fixture.ids[fixture.deviceId as keyof typeof fixture.ids],
  devices: peers.map((deviceId) => ({ device_identity_key: fixture.ids[deviceId], state: 'active' }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));

beforeEach(async () => {
  fixture.root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-three-peer-'));
  for (const deviceId of peers) {
    selectLibrary(deviceId);
    const connection = initializeDatabaseConnection(openDatabaseConnection());
    dbPaths.set(deviceId, connection.dbPath);
    const driver = connection.driver;
    driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')",
      [fixture.ids[deviceId]]);
    for (const peerId of peers) driver.execute(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at) VALUES ('group', ?, ?, ?, ?, 'mac', 'active', 'now', 'now')`,
    [fixture.ids[peerId], fixture.anchors[peerId], `/library-${peerId}`, peerId]);
    closeDatabaseConnection();
  }
});

afterEach(async () => {
  closeDatabaseConnection();
  dbPaths.clear();
  await fs.rm(fixture.root, { recursive: true, force: true });
});

function selectLibrary(deviceId: string) {
  closeDatabaseConnection();
  fixture.deviceId = deviceId;
  saveCurrentLibraryHome(path.join(fixture.root, `library-${deviceId}`));
}

async function transfer(sourceId: string, targetId: string, packName: string, after = 0) {
  selectLibrary(sourceId);
  const target = new Database(dbPaths.get(targetId)!);
  markDesktopSyncGroupMemberStateReady(fixture.ids[targetId as keyof typeof fixture.ids]);
  const http = await startAuthenticatedSyncHttp({ archiveDir: fixture.root,
    sourceDeviceId: fixture.ids[sourceId as keyof typeof fixture.ids],
    receiverDeviceId: fixture.ids[targetId as keyof typeof fixture.ids] });
  const port = createBetterSqliteDbPort(target);
  try {
    let url = (await prepareMutationRoundPack(http, port, after)).url;
    let applied = false;
    const sentVersions: string[] = [];
    const sentReviewOpIds: string[] = [];
    for (let page = 0; page < 20; page += 1) {
      const archive = await http.archive(url);
      const incoming = path.join(fixture.root, `${packName}-${page}.db`);
      try {
        const manifest = await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
          outputPath: incoming,
          expectedPeerId: fixture.ids[targetId as keyof typeof fixture.ids],
          expectedSourcePeerId: fixture.ids[sourceId as keyof typeof fixture.ids],
          maxDatabaseBytes: 4 * 1024 * 1024 });
        await port.run('ATTACH DATABASE ? AS inc', [incoming]);
        try {
          await assertSyncPackManifestMatchesDatabase(port, manifest);
          const facts = readThreePeerIncomingFacts(target, Boolean(manifest.dependencyPage));
          sentVersions.push(...facts.versionIds);
          sentReviewOpIds.push(...facts.reviewOpIds);
          const result = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: after,
            hostName: targetId, sourcePeerId: fixture.ids[sourceId as keyof typeof fixture.ids],
            enqueueSearchInvalidations: false });
          if (!result.dependencyProgress) {
            applied = result.applied;
            const replay = await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: result.toStateSeq,
              hostName: targetId, sourcePeerId: fixture.ids[sourceId as keyof typeof fixture.ids],
              enqueueSearchInvalidations: false });
            expect(replay.applied).toBe(false);
            break;
          }
          url = new URL(dependencyResumeUrl(url.toString(), result.dependencyProgress));
        } finally { await port.run('DETACH DATABASE inc'); }
      } finally { await archive.cleanup(); }
    }
    expect(applied).toBe(true);
    return {
      sentVersions, sentReviewOpIds, reviews: target.prepare('SELECT * FROM review_log ORDER BY op_id').all(),
      versions: target.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all(),
      cursor: target.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress WHERE peer_id = ?')
        .get(fixture.ids[sourceId as keyof typeof fixture.ids])
    };
  } finally {
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(fixture.ids[targetId as keyof typeof fixture.ids]);
    target.close();
    closeDatabaseConnection();
  }
}

it('relays the same version identities through isolated A, B, and C libraries over authenticated HTTP', async () => {
  selectLibrary('A');
  seedThreePeerVersions(openDatabaseConnection().driver, 23);
  const atB = await transfer('A', 'B', 'a-to-b');
  expect(atB.versions).toHaveLength(23);
  expect(atB.cursor).toEqual({ cursor_state_seq: 1 });
  const atC = await transfer('B', 'C', 'b-to-c');
  expect(atC.versions).toEqual(atB.versions);
  expect(atC.cursor).toEqual({ cursor_state_seq: 1 });
  selectLibrary('A');
  appendThreePeerVersion24(openDatabaseConnection().driver);
  const newerB = await transfer('A', 'B', 'a-to-b-new', 1);
  expect(newerB.sentVersions).toEqual(['v24']);
  expect(newerB.versions).toHaveLength(24);
  const newerC = await transfer('B', 'C', 'b-to-c-new', 1);
  expect(newerC.sentVersions).toEqual(['v24']);
  expect(newerC.versions).toEqual(newerB.versions);
});

it('refuses to relay a current version whose body was lost at the middle peer', async () => {
  selectLibrary('A');
  seedThreePeerVersions(openDatabaseConnection().driver, 23);
  await transfer('A', 'B', 'shell-source');
  const middle = new Database(dbPaths.get('B')!);
  try {
    middle.prepare('UPDATE node_sync_versions SET body_text = NULL WHERE version_id = ?').run('v23');
  } finally { middle.close(); }

  await expect(transfer('B', 'C', 'shell-relay'))
    .rejects.toThrow('sync_pack_fact_body_unavailable:v23');
  const last = new Database(dbPaths.get('C')!, { readonly: true });
  try {
    expect(last.prepare('SELECT count(*) AS count FROM node_sync_versions').get()).toEqual({ count: 0 });
  } finally { last.close(); }
});

it('relays original review identities and only the new operation through three independent HTTP libraries', async () => {
  selectLibrary('A');
  seedThreePeerVersions(openDatabaseConnection().driver, 23);
  addThreePeerReview(openDatabaseConnection().driver, 1, 2);
  const initialSource = openDatabaseConnection().driver.queryAll('SELECT * FROM review_log ORDER BY op_id');
  const initialB = await transfer('A', 'B', 'review-a-b');
  const initialC = await transfer('B', 'C', 'review-b-c');
  expect(initialB.reviews).toEqual(initialSource);
  expect(initialC.reviews).toEqual(initialSource);
  expect(initialC.reviews).toHaveLength(1);
  expect(initialC.reviews[0]).toMatchObject({ op_id: 'op-1', host_name: 'A' });
  selectLibrary('A');
  addThreePeerReview(openDatabaseConnection().driver, 2, 3);
  const finalSource = openDatabaseConnection().driver.queryAll('SELECT * FROM review_log ORDER BY op_id');
  const newerB = await transfer('A', 'B', 'review-a-b-new', 2);
  const newerC = await transfer('B', 'C', 'review-b-c-new', 2);
  expect(newerB.sentReviewOpIds).toEqual(['op-2']);
  expect(newerC.sentReviewOpIds).toEqual(['op-2']);
  expect(newerB.sentVersions).toEqual([]);
  expect(newerC.sentVersions).toEqual([]);
  expect(newerB.reviews).toEqual(finalSource);
  expect(newerC.reviews).toEqual(finalSource);
  expect(newerC.reviews).toHaveLength(2);
  expect(newerC.reviews[1]).toMatchObject({ op_id: 'op-2', host_name: 'A' });
  await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
  await fs.writeFile('.tmp/artifacts/T267/three-peer-review-relay.json', JSON.stringify({
    atB: newerB, atC: newerC
  }, null, 2));
});
