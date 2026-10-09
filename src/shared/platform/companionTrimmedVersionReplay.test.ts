// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-trimmed-version-replay';
vi.mock('../../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { buildDesktopSyncPack } from '../../../electron/database/syncPackBuilder.js';
import { initializeDatabaseConnection } from '../../../lib/core/database/index.js';
import { retainLocalEditBase } from '../../../lib/core/sync/nodeVersionLocalEditHold.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { loadCurrentSyncNodeRecord } from '../../../lib/core/sync/syncNodeGraph.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract.js';

import { applyCompanionSyncPackNodesWithDbPort } from './companionSyncPackNodes.js';

const nodeId = 'offline-topic';
const createdAt = '2026-09-27T00:00:00.000Z';
const onlineIdentity = createSyncGroupDeviceIdentity({
  device_anchor: 'a1111111-1111-4111-8111-111111111111',
  group_id: 'group', library_path: '/online', path_flavor: 'posix'
});
const offlineIdentity = createSyncGroupDeviceIdentity({
  device_anchor: 'b2222222-2222-4222-8222-222222222222',
  group_id: 'group', library_path: '/offline', path_flavor: 'posix'
});
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-trimmed-replay-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it.each(['desktop', 'companion'] as const)(
  'replays a trimmed A to E chain into an offline A to F branch through %s apply', async (mode) => {
  openLibrary('online');
  seedNode('E', 'left edited\nright one');
  for (const [id, parent, content] of [
    ['A', null, 'left one\nright one'],
    ['B', 'A', 'left draft\nright one'],
    ['C', 'B', 'left revised\nright one'],
    ['D', 'C', 'left almost\nright one'],
    ['E', 'D', 'left edited\nright one']
  ] as const) insertVersion(id, parent, content);
  installOfflineBaseProof();
  const online = openDatabaseConnection();
  expect(await collectNodeVersionPayloads(createBetterSqliteDbPort(online.sqlite), nodeId))
    .toEqual({ released: 3, skipped: null });
  expect(versionBodies()).toEqual([['A', 'left one\nright one'],
    ['B', null], ['C', null], ['D', null], ['E', 'left edited\nright one']]);
  expect(online.sqlite.prepare('SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?')
    .all('E')).toEqual([{ parent_version_id: 'D' }]);
  const incomingPath = await buildIncomingPack('online', onlineIdentity.identity_key,
    offlineIdentity.identity_key);
  closeDatabaseConnection();

  openLibrary('offline');
  seedNode('F', 'left one\nright edited');
  insertVersion('A', null, 'left one\nright one');
  insertVersion('F', 'A', 'left one\nright edited');
  installGroup(offlineIdentity.identity_key);
  const offline = openDatabaseConnection();
  const port = createBetterSqliteDbPort(offline.sqlite);
  await retainLocalEditBase(port, { holdId: 'offline-editor', nodeId, versionId: 'F' });
  await expect(applyIncoming(mode, port, incomingPath, 'offline-device',
    onlineIdentity.identity_key, offlineIdentity.identity_key))
    .resolves.toMatchObject({ applied: true, toStateSeq: 1 });
  const current = offline.sqlite.prepare(`SELECT content, current_version_id FROM nodes WHERE id = ?`)
    .get(nodeId) as { content: string; current_version_id: string };
  const chosen = await loadCurrentSyncNodeRecord(port, nodeId);
  expect(new Set([chosen?.body_text, ...chosen?.alternative_bodies?.map(body => body.text) ?? []]))
    .toEqual(new Set(['left edited\nright one', 'left one\nright edited']));
  expect(current.current_version_id).toMatch(/^ver_[a-f0-9]{24}$/);
  expect(versionBodies()).toEqual([['A', 'left one\nright one'],
    ['B', null], ['C', null], ['D', null], ['E', 'left edited\nright one'],
    ['F', 'left one\nright edited'], [current.current_version_id, current.content]]);
  expect(offline.sqlite.prepare(`SELECT parent_version_id FROM node_sync_version_parents
    WHERE version_id = ? ORDER BY ordinal`).all(current.current_version_id))
    .toEqual([{ parent_version_id: 'E' }, { parent_version_id: 'F' }]);
  expect(offline.sqlite.prepare(`SELECT body_text,
    json_extract(snapshot_json, '$.content') AS snapshot_content
    FROM node_sync_versions WHERE version_id = ?`).get(current.current_version_id))
    .toEqual({ body_text: current.content, snapshot_content: null });
  await replayMergedVersionToOnline(current, mode);
});

async function replayMergedVersionToOnline(current: { content: string; current_version_id: string },
  mode: 'desktop' | 'companion') {
  const returnPath = await buildIncomingPack('offline', offlineIdentity.identity_key,
    onlineIdentity.identity_key);
  closeDatabaseConnection();
  openLibrary('online');
  const returned = openDatabaseConnection();
  const returnPort = createBetterSqliteDbPort(returned.sqlite);
  await expect(applyIncoming(mode, returnPort, returnPath, 'online-device',
    offlineIdentity.identity_key, onlineIdentity.identity_key))
    .resolves.toMatchObject({ applied: true });
  expect(returned.sqlite.prepare(`SELECT content, current_version_id FROM nodes WHERE id = ?`)
    .get(nodeId)).toEqual(current);
}

async function applyIncoming(mode: 'desktop' | 'companion', port: ReturnType<typeof createBetterSqliteDbPort>,
  packPath: string, hostName: string, sourcePeerId: string, deviceId: string) {
  if (mode === 'companion') return applyCompanionSyncPackNodesWithDbPort({
    currentCursor: 0, deviceId, hostName, packPath, sourcePeerId
  }, port);
  await port.run(`ATTACH DATABASE '${packPath.replaceAll("'", "''")}' AS inc`);
  try {
    return await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0, hostName, sourcePeerId
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}

function openLibrary(name: string) {
  appDataDir = path.join(tempRoot, name);
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().sqlite.exec(`CREATE TABLE IF NOT EXISTS sync_push_ack (
    client_op_id TEXT PRIMARY KEY NOT NULL, object_type TEXT NOT NULL,
    object_id TEXT NOT NULL, state_seq INTEGER, status TEXT NOT NULL, acked_at TEXT NOT NULL)`);
}

function seedNode(versionId: string, content: string) {
  const db = openDatabaseConnection().sqlite;
  db.prepare(`INSERT INTO nodes
    (id, kind, title, is_title_manual, hide_title_heading, content,
     current_version_id, created_at, updated_at)
    VALUES (?, 'topic', 'Offline Topic', 1, 0, ?, ?, ?, ?)`)
    .run(nodeId, content, versionId, createdAt, createdAt);
  db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
     last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', ?, 1, ?, ?, 'online-device', ?, 1)`)
    .run(nodeId, versionId, `hash-${versionId}`, createdAt);
}

function insertVersion(id: string, parent: string | null, content: string) {
  const db = openDatabaseConnection().sqlite;
  const snapshot = { anchor_link: null, attachments: [], content, created_at: createdAt,
    deleted_at: null, desired_retention: null, hide_title_heading: false, id: nodeId,
    image_regions: null, is_title_manual: true, kind: 'topic', opening_text: null,
    parent_id: null, position: null, priority: null, reveal: null,
    title: 'Offline Topic', updated_at: createdAt, virtual_filter: null };
  db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at,
     content_hash, body_text, snapshot_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, nodeId, parent, id === 'F' ? 'offline-device' : 'online-device',
      createdAt, `hash-${id}`, content, JSON.stringify(snapshot));
  if (parent) db.prepare(`INSERT INTO node_sync_version_parents VALUES (?, ?, 0)`).run(id, parent);
}

function installOfflineBaseProof() {
  installGroup(onlineIdentity.identity_key);
  openDatabaseConnection().sqlite.prepare(`
    INSERT INTO node_version_device_revisions VALUES
      ('group', ?, 'epoch', 1, 'pack-A', NULL, 'now')`).run(offlineIdentity.identity_key);
  openDatabaseConnection().sqlite.prepare(`INSERT INTO node_version_device_bases VALUES
    ('group', ?, 'offline-topic', 'A', 'epoch', 1, 'pack-A', 'now')`)
    .run(offlineIdentity.identity_key);
}

function installGroup(localDeviceId: string) {
  const db = openDatabaseConnection().sqlite;
  db.prepare(`
    INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES ('group', 'Group', 'key', 'now', 'now')`).run();
  db.prepare(`INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')`)
    .run(localDeviceId);
  const insert = db.prepare(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
     device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, ?, ?, 'active', 'now', 'now')`);
  insert.run(onlineIdentity.identity_key, onlineIdentity.device_anchor,
    onlineIdentity.canonical_library_path, 'Online', 'mac');
  insert.run(offlineIdentity.identity_key, offlineIdentity.device_anchor,
    offlineIdentity.canonical_library_path, 'Offline', 'android');
}

function versionBodies() {
  return (openDatabaseConnection().sqlite.prepare(`SELECT version_id, body_text
    FROM node_sync_versions WHERE object_id = ? ORDER BY version_id`).all(nodeId) as
    Array<{ version_id: string; body_text: string | null }>).map(
    (row) => [row.version_id, row.body_text]
  );
}

async function buildIncomingPack(name: string, fromPeerId: string, toPeerId: string) {
  const packPath = path.join(tempRoot, `${name}.syncpack`);
  await buildDesktopSyncPack({ createdAt, fromPeerId, fromStateSeq: 0,
    outputPath: packPath, packId: `${name}-pack`, toPeerId });
  const bytes = fsSync.readFileSync(packPath);
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const contentStart = offset + 30 + nameLength + bytes.readUInt16LE(offset + 28);
    if (bytes.subarray(offset + 30, offset + 30 + nameLength).toString() === 'incoming.db.deflate') {
      const incomingPath = path.join(tempRoot, `${name}.db`);
      fsSync.writeFileSync(incomingPath, inflateSync(bytes.subarray(contentStart, contentStart + size)));
      return incomingPath;
    }
    offset = contentStart + size;
  }
  throw new Error('incoming_db_missing');
}
