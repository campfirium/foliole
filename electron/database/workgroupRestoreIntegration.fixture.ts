import { promises as fs } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import Database from 'better-sqlite3';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { applyDesktopRestorePage } from '../sync/desktopSyncGroupRestoreApply.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';

export const restoreId = 'restore-later';
export const groupId = 'group-1';
const sourceIdentity = createSyncGroupDeviceIdentity({ device_anchor: 'a1111111-1111-4111-8111-111111111111',
  group_id: groupId, library_path: '/library/a', path_flavor: 'posix' });
const targetIdentity = createSyncGroupDeviceIdentity({ device_anchor: 'b2222222-2222-4222-8222-222222222222',
  group_id: groupId, library_path: '/library/b', path_flavor: 'posix' });
const observerIdentity = createSyncGroupDeviceIdentity({ device_anchor: 'c3333333-3333-4333-8333-333333333333',
  group_id: groupId, library_path: '/library/c', path_flavor: 'posix' });
export const sourceId = sourceIdentity.identity_key;
export const targetId = targetIdentity.identity_key;
export const observerId = observerIdentity.identity_key;
export const at = '2026-09-27T12:00:00.000Z';

export function database(localId: string, filePath = ':memory:') {
  const db = new Database(filePath);
  db.pragma('foreign_keys = ON');
  initializeDatabaseSchema(db);
  if (db.prepare('SELECT group_id FROM sync_groups WHERE group_id = ?').get(groupId)) return db;
  db.prepare(`INSERT INTO sync_groups VALUES (?, 'Group', 'secret', ?, ?)`).run(groupId, at, at);
  db.prepare(`INSERT INTO sync_group_local_state VALUES (1, ?, ?, 'active', ?)`)
    .run(groupId, localId, at);
  const member = db.prepare(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
     device_name, platform, state, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'desktop', 'active', ?, ?)`);
  member.run(groupId, sourceId, sourceIdentity.device_anchor, sourceIdentity.canonical_library_path,
    'A', at, at);
  member.run(groupId, targetId, targetIdentity.device_anchor, targetIdentity.canonical_library_path,
    'B', at, at);
  member.run(groupId, observerId, observerIdentity.device_anchor, observerIdentity.canonical_library_path,
    'C', at, at);
  return db;
}

export function seedNode(db: Database.Database, id: string, stateSeq = 1) {
  const content = `# ${id}`;
  const versionId = `${id}-version`;
  db.prepare(`INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES (?, 'topic', ?, ?, ?, ?, ?)`).run(id, id, content, versionId, at, at);
  db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, 'A', ?, ?, ?, ?)`).run(versionId, id, at, `hash-${id}`, content,
      JSON.stringify({ id, kind: 'topic', title: id, content, created_at: at, updated_at: at }));
  db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
     last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', ?, ?, ?, ?, 'A', ?, 1)`)
    .run(id, stateSeq, versionId, `hash-${id}`, at);
}

export function seedRestore(db: Database.Database, appliedAt: string | null, id = restoreId,
  restoredAt = at, peerId = sourceId) {
  db.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, groupId, restoredAt, peerId, appliedAt, at);
  if (appliedAt) db.prepare('UPDATE sync_state_sequence SET source_epoch = ?').run(id);
}

export async function buildPage(source: Database.Database, root: string, from: number, to?: number,
  id = restoreId, peerId = sourceId, receiverId = targetId) {
  const packPath = path.join(root, `${id}-${from}-${to ?? 'end'}.zip`);
  const built = await buildDesktopSyncPackFromDriver({ fromPeerId: peerId, toPeerId: receiverId,
    fromStateSeq: from, ...(to === undefined ? {} : { toStateSeq: to }), restoreId: id,
    outputPath: packPath, packId: path.basename(packPath) }, createBetterSqlite3Driver(source));
  const incomingPath = `${packPath}.db`;
  await fs.writeFile(incomingPath, inflatePack(await fs.readFile(packPath)));
  return { path: incomingPath, frontier: built.frontierStateSeq };
}

export async function applyPage(receiver: 'desktop' | 'companion', target: Database.Database,
  after: number, pack: { path: string; frontier: number }, id = restoreId, peerId = sourceId) {
  const port = createBetterSqliteDbPort(target);
  if (receiver === 'companion') {
    // Keep renderer dependencies out of the desktop main-process compilation graph.
    const companionModule = '../../src/shared/platform/companionSyncPackNodes.js';
    const { applyCompanionSyncPackNodesWithDbPort } = await import(companionModule);
    return applyCompanionSyncPackNodesWithDbPort({
    currentCursor: after, deviceId: (target.prepare('SELECT local_device_identity_key FROM sync_group_local_state')
      .get() as { local_device_identity_key: string }).local_device_identity_key, expectedRestoreId: id,
      hostName: 'B', packPath: pack.path, sourcePeerId: peerId }, port);
  }
  await port.run('ATTACH DATABASE ? AS inc', [pack.path]);
  try {
    return await applyDesktopRestorePage({ after, frontierStateSeq: pack.frontier,
      groupId, peerId, port, restoreId: id,
      apply: (tx, currentCursor) => applySyncPackNodeSurfaceWithDbPort(tx, {
        currentCursor, expectedRestoreId: id, hostName: 'B',
        sourceHostName: 'A', sourcePeerId: peerId }) });
  } finally { await port.run('DETACH DATABASE inc'); }
}

export function nodeIds(db: Database.Database) {
  return db.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id")
    .all().map((row) => (row as { id: string }).id);
}

export function inflatePack(bytes: Buffer) {
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const length = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + length + bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString();
    if (name === 'incoming.db.deflate') return inflateSync(bytes.subarray(start, start + size));
    offset = start + size;
  }
  throw new Error('incoming_db_missing');
}
