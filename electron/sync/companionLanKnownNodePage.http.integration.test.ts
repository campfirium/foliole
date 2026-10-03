// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import { encodeSyncPackFactClaims, type SyncPackFactIndex } from '../../lib/core/sync/syncPackFactPresence.js';
import { stageSyncPackKnownFactClaims } from '../../lib/core/sync/syncPackKnownFactClaims.js';
import { assertSyncPackManifestMatchesDatabase } from '../../lib/core/sync/syncPackManifestValidation.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { mockedSyncPackBuilderAppDataDir,
  resolveSyncPackPath, setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: 'source',
  devices: [{ device_identity_key: 'source', state: 'active' },
    { device_identity_key: 'receiver', state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

function seedSource() {
  const source = openDatabaseConnection().driver;
  for (let i = 1; i <= 28; i++) {
    const id = `node-${i}`;
    source.execute(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES (?, 'topic', ?, ?, 'now', 'now')`, [id, id, `version-${i}`]);
    source.execute(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, ?, 'source', 'now', ?, '', ?)`,
    [`version-${i}`, id, `hash-${i}`, JSON.stringify({ id, content: '' })]);
    source.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      VALUES ('node', ?, ?, ?, 'source', 'now')`, [id, i + 1, `hash-${i}`]);
  }
  source.execute('UPDATE sync_object_state SET sync_dirty = 0');
  source.execute('UPDATE sync_state_sequence SET high_water = 29 WHERE singleton_id = 1');
}

function receiver(name: string, known: boolean) {
  const db = new Database(resolveSyncPackPath(name));
  db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  db.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'receiver', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now');
    INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES ('special-inbox', 'folder', 'Inbox', 'now', 'now');`);
  const source = openDatabaseConnection().driver;
  const nodes = source.queryAll<{ id: string; kind: string; title: string;
    current_version_id: string | null }>(`SELECT id, kind, title, current_version_id
    FROM nodes WHERE id LIKE 'node-%'`);
  const versions = source.queryAll<{ version_id: string; object_id: string; host_name: string;
    created_at: string; content_hash: string; body_text: string | null; snapshot_json: string }>(
    `SELECT version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json
     FROM node_sync_versions WHERE object_id LIKE 'node-%'`
  );
  const states = source.queryAll<{ object_id: string; state_seq: number; content_hash: string;
    last_modified_by_host_name: string;
    updated_at: string }>(`SELECT object_id, state_seq, content_hash,
    last_modified_by_host_name, updated_at
    FROM sync_object_state WHERE object_type = 'node' AND object_id LIKE 'node-%'`);
  const versionByNode = new Map(nodes.map((node) => [node.id, node.current_version_id]));
  if (known) {
    const insertNode = db.prepare(`INSERT INTO nodes
      (id, kind, title, current_version_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'now', 'now')`);
    for (const node of nodes) insertNode.run(node.id, node.kind, node.title, node.current_version_id);
  }
  const insertVersion = db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  if (known) {
    for (const version of versions) insertVersion.run(version.version_id, version.object_id,
      version.host_name, version.created_at, version.content_hash,
      version.body_text, version.snapshot_json);
  }
  if (known) {
    const insertState = db.prepare(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at) VALUES ('node', ?, ?, ?, ?, ?, ?)`);
    for (const state of states) insertState.run(state.object_id, state.state_seq,
      versionByNode.get(state.object_id), state.content_hash,
      state.last_modified_by_host_name, state.updated_at);
  }
  return db;
}

async function applyArchive(target: Database.Database, archivePath: string, name: string) {
  const incoming = resolveSyncPackPath(name);
  const manifest = await extractSyncPackDatabaseFromFile({ archivePath,
    outputPath: incoming, expectedPeerId: 'receiver', expectedSourcePeerId: 'source',
    maxDatabaseBytes: 4 * 1024 * 1024 });
  const port = createBetterSqliteDbPort(target);
  await port.run('ATTACH DATABASE ? AS inc', [incoming]);
  try {
    await assertSyncPackManifestMatchesDatabase(port, manifest);
    return await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0,
      hostName: 'receiver', sourcePeerId: 'source', recordVersionReceipt: true,
      enqueueSearchInvalidations: false });
  } finally { await port.run('DETACH DATABASE inc'); }
}

function assertMatchingReceivers(known: Database.Database, fresh: Database.Database) {
  expect(fresh.prepare('SELECT COUNT(*) AS count FROM nodes').get()).toEqual({ count: 29 });
  expect(known.prepare('SELECT COUNT(*) AS count FROM nodes').get())
    .toEqual(fresh.prepare('SELECT COUNT(*) AS count FROM nodes').get());
  expect(fresh.prepare(`SELECT id, current_version_id FROM nodes
    WHERE id LIKE 'node-%' ORDER BY id`).all())
    .toEqual(known.prepare(`SELECT id, current_version_id FROM nodes
      WHERE id LIKE 'node-%' ORDER BY id`).all());
  expect(fresh.prepare(`SELECT cursor_state_seq FROM sync_pack_receive_progress
    WHERE group_id = 'group' AND peer_id = 'source'`).get())
    .toEqual(known.prepare(`SELECT cursor_state_seq FROM sync_pack_receive_progress
      WHERE group_id = 'group' AND peer_id = 'source'`).get());
}

it('keeps a 28-node known page unchanged while applying the same HTTP pack to a fresh receiver', async () => {
  seedSource();
  const known = receiver('known.db', true);
  const fresh = receiver('fresh.db', false);
  markDesktopSyncGroupMemberStateReady('receiver');
  const server = await startAuthenticatedSyncHttp();
  try {
    const factsPath = '/companion/sync-pack-facts?page_contract=bounded-v1&after_state_seq=0';
    const facts = await server.getJson(factsPath) as { source_view_id: string;
      index: SyncPackFactIndex };
    expect(facts.index.to_state_seq).toBe(29);
    const claims = await stageSyncPackKnownFactClaims(createBetterSqliteDbPort(known), {
      groupId: 'group', peerId: 'source', sourceViewId: facts.source_view_id
    }, facts.index);
    const freshClaims = await stageSyncPackKnownFactClaims(createBetterSqliteDbPort(fresh), {
      groupId: 'group', peerId: 'source', sourceViewId: facts.source_view_id
    }, facts.index);
    expect(claims.versions.length).toBeGreaterThan(0);
    expect(freshClaims.versions).toEqual([]);
    const bits = encodeSyncPackFactClaims(facts.index, freshClaims);
    const claim = new URL(factsPath, server.origin);
    claim.searchParams.set('fact_view', facts.source_view_id);
    claim.searchParams.set('fact_index_id', facts.index.index_id);
    claim.searchParams.set('have_v', bits.versions);
    claim.searchParams.set('have_p', bits.parents);
    claim.searchParams.set('have_r', bits.reviews);
    const ready = await server.getJson(claim.pathname + claim.search);
    expect(ready.ready).toBe(true);
    let url = new URL('/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0', server.origin);
    url.searchParams.set('fact_view', facts.source_view_id);
    let final = false;
    for (let turn = 0; turn < 40; turn++) {
      const archive = await server.archive(url);
      try {
        const repeated = await applyArchive(known, archive.filePath, `known-${turn}.db`);
        const changed = await applyArchive(fresh, archive.filePath, `fresh-${turn}.db`);
        if (changed.dependencyProgress) {
          url = new URL(dependencyResumeUrl(url.href, changed.dependencyProgress));
          continue;
        }
        expect(repeated.appliedObjectCount).toBe(0);
        expect(changed.applied).toBe(true);
        expect(repeated.toStateSeq).toBe(changed.toStateSeq);
        final = true;
        break;
      } finally { await archive.cleanup(); }
    }
    expect(final).toBe(true);
    assertMatchingReceivers(known, fresh);
  } finally {
    await server.close();
    revokeDesktopSyncGroupMemberStateReadiness('receiver');
    known.close();
    fresh.close();
  }
});
