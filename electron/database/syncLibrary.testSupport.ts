import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import type { NodeAnchorLinkPayload } from '../../lib/core/database/nodeMutationPayloads.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

export interface Peer {
  id: string; name: string; anchor: string; file: string;
  db: Database.Database;
  driver: ReturnType<typeof createBetterSqlite3Driver>;
  port: ReturnType<typeof createBetterSqliteDbPort>;
}
export let root = '';
let peers: Peer[] = [];
let sequence = 0;

export async function startLibraries() {
  root = await mkdtemp(path.join(os.tmpdir(), 'foliole-empty-sync-'));
  peers = [];
  sequence = 0;
}

export async function closeLibraries() {
  for (const peer of peers) peer.db.close();
  await rm(root, { recursive: true, force: true });
}

export function createPeer(id: string): Peer {
  const file = path.join(root, `${id}.db`);
  const anchor = randomUUID();
  const identity = createSyncGroupDeviceIdentity({ device_anchor: anchor, group_id: 'group', library_path: file,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(file) });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  initializeDatabaseSchema(db);
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', ?, 'now')").run(JSON.stringify(id));
  const peer = { id: identity.identity_key, name: id, anchor, file, db, driver: createBetterSqlite3Driver(db), port: createBetterSqliteDbPort(db) };
  bindParentOrderWriter(peer.driver, { deviceAnchor: anchor, libraryPath: file });
  peers.push(peer);
  return peer;
}

export function joinPeers(...members: Peer[]) {
  for (const peer of members) {
    peer.db.prepare(`INSERT INTO sync_groups
      (group_id, display_name, workgroup_key, created_at, updated_at) VALUES ('group', 'Group', 'key', 'now', 'now')`).run();
    peer.db.prepare('INSERT INTO sync_group_local_state VALUES (1, ?, ?, ?, ?)')
      .run('group', peer.id, 'active', 'now');
    for (const member of members) peer.db.prepare(`INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at) VALUES ('group', ?, ?, ?, ?, 'mac', 'active', 'now', 'now')`)
      .run(member.id, member.anchor, member.file, member.name);
  }
}

export function edit(peer: Peer, content: string, title = 'Topic', anchorLink: NodeAnchorLinkPayload | null = null,
  kind: 'topic' | 'folder' | 'item' = 'topic') {
  const at = new Date(Date.UTC(2026, 8, 30, 0, 0, ++sequence)).toISOString();
  return peer.driver.transaction((driver) => {
    upsertNodeSnapshot(driver, { anchorLink, content, createdAt: '2026-09-30T00:00:00.000Z',
      hostName: peer.name, isTitleManual: true, kind, nodeId: 'topic', parentNodeId: null,
      position: null, reveal: null, title, updatedAt: at });
    return flushNodeSyncVersionWithDriver(driver, 'topic', peer.name, at)!;
  });
}

export function history(peer: Peer) {
  return peer.db.prepare(`SELECT version_id, parent_version_id, body_text, snapshot_json
    FROM node_sync_versions WHERE object_id = 'topic' ORDER BY created_at, version_id`).all() as Array<{
    version_id: string; parent_version_id: string | null; body_text: string | null; snapshot_json: string;
  }>;
}

export function assertPersisted(peer: Peer, content: string, versionId?: string) {
  const reopened = new Database(peer.file, { readonly: true });
  try {
    const node = reopened.prepare(`SELECT content, current_version_id FROM nodes WHERE id = 'topic'`)
      .get() as { content: string; current_version_id: string };
    expect(loadNodeBodyResolution(createBetterSqlite3Driver(reopened), 'topic'))
      .toMatchObject({ status: 'resolved', content });
    expect(node.content).toBe(content);
    if (versionId) expect(node.current_version_id).toBe(versionId);
    const broken = reopened.prepare(`SELECT v.version_id FROM node_sync_versions v
      LEFT JOIN node_sync_versions p ON p.version_id = v.parent_version_id
      WHERE v.parent_version_id IS NOT NULL AND p.version_id IS NULL`).all();
    expect(broken).toEqual([]);
    expect(reopened.prepare(`SELECT p.version_id FROM node_sync_version_parents p
      LEFT JOIN node_sync_versions v ON v.version_id = p.parent_version_id WHERE v.version_id IS NULL`).all()).toEqual([]);
  } finally { reopened.close(); }
}
