// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims, probeSyncPackFactPresence,
  type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { saveCurrentLibraryHome } from '../ipc/libraryPathBootstrap.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
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

function seedVersions(count: number) {
  selectLibrary('A');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Node 1', ?, ?, 'now', 'now')`, [`body-${count}`, `v${count}`]);
  for (let i = 1; i <= count; i += 1) {
    const id = `v${String(i).padStart(2, '0')}`;
    const parent = i === 1 ? null : `v${String(i - 1).padStart(2, '0')}`;
    driver.execute(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
      host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node-1', ?, 'A', 'now', ?, ?, '{"id":"node-1","content":null}')`,
    [id, parent, `hash-${id}`, `body-${i}`]);
    if (parent) driver.execute('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)', [id, parent]);
  }
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', 'node-1', 1, ?, 'A', 'now', 0)`, [`hash-v${count}`]);
}

function appendVersion24() {
  selectLibrary('A');
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('v24', 'node-1', 'v23', 'A', 'now', 'hash-v24', 'body-24',
      '{"id":"node-1","content":null}')`);
  driver.execute("INSERT INTO node_sync_version_parents VALUES ('v24', 'v23', 0)");
  driver.execute("UPDATE nodes SET current_version_id = 'v24', content = 'body-24' WHERE id = 'node-1'");
  driver.execute("UPDATE sync_object_state SET state_seq = 2, content_hash = 'hash-v24' WHERE object_id = 'node-1'");
  driver.execute('UPDATE sync_state_sequence SET high_water = 2 WHERE singleton_id = 1');
}

async function prepareFactUrl(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  port: ReturnType<typeof createBetterSqliteDbPort>, after: number) {
    const index = (await http.getJson(
      `/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=${after}`
    )) as unknown as SyncPackFactIndex;
    const claims = await probeSyncPackFactPresence(port, index);
    const bits = encodeSyncPackFactClaims(index, claims);
    const url = new URL(`/companion/sync-pack?page_contract=bounded-v1&after_state_seq=${after}`, http.origin);
    url.searchParams.set('fact_index_id', index.index_id);
    url.searchParams.set('have_v', bits.versions);
    url.searchParams.set('have_p', bits.parents);
    url.searchParams.set('have_r', bits.reviews);
    return url;
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
    let url = await prepareFactUrl(http, port, after);
    let applied = false;
    const sentVersions: string[] = [];
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
          const rows = target.prepare('SELECT version_id FROM inc.node_sync_versions').all() as Array<{ version_id: string }>;
          sentVersions.push(...rows.map((row) => row.version_id));
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
      sentVersions, versions: target.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all(),
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
  seedVersions(23);
  const atB = await transfer('A', 'B', 'a-to-b');
  expect(atB.versions).toHaveLength(23);
  expect(atB.cursor).toEqual({ cursor_state_seq: 1 });
  const atC = await transfer('B', 'C', 'b-to-c');
  expect(atC.versions).toEqual(atB.versions);
  expect(atC.cursor).toEqual({ cursor_state_seq: 1 });
  appendVersion24();
  const newerB = await transfer('A', 'B', 'a-to-b-new', 1);
  expect(newerB.sentVersions).toEqual(['v24']);
  expect(newerB.versions).toHaveLength(24);
  const newerC = await transfer('B', 'C', 'b-to-c-new', 1);
  expect(newerC.sentVersions).toEqual(['v24']);
  expect(newerC.versions).toEqual(newerB.versions);
});

it('refuses to relay a current version whose body was lost at the middle peer', async () => {
  seedVersions(23);
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
